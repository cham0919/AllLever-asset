import UIKit
import Capacitor
import AuthenticationServices
import LocalAuthentication
import Security

// 앱 첫 화면: Capacitor 기본 화면에 우리 플러그인(WebAuth)을 등록해요. (Main.storyboard가 이 클래스를 써요)
class MainViewController: CAPBridgeViewController {
    private var cover: UIView?

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WebAuthPlugin())
        bridge?.registerPluginInstance(BiometricPlugin())
        bridge?.registerPluginInstance(SecureStorePlugin())
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(hideContent), name: UIApplication.willResignActiveNotification, object: nil)
        nc.addObserver(self, selector: #selector(showContent), name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    // 앱 잠금을 켠 경우: 앱 전환 화면에 금액이 보이지 않게 가림막을 덮어요
    @objc private func hideContent() {
        guard BiometricPlugin.privacyOn, cover == nil, let v = view else { return }
        let c = UIView(frame: v.bounds)
        c.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        c.backgroundColor = UIColor { $0.userInterfaceStyle == .dark
            ? UIColor(red: 14/255, green: 16/255, blue: 19/255, alpha: 1)
            : UIColor(red: 241/255, green: 241/255, blue: 238/255, alpha: 1) }
        v.addSubview(c); cover = c
    }
    @objc private func showContent() { cover?.removeFromSuperview(); cover = nil }
}

// 로그인 세션 값 보관: 아이폰 키체인 (이 기기에서만, 잠금 해제 후에만 읽을 수 있어요. 백업·다른 기기로 옮겨지지 않아요)
// 앱을 지웠다 다시 깔면 키체인에 남은 값은 쓰지 않고 지워요 (앱 저장 공간에 표시가 없으면 새 설치로 봐요).
@objc(SecureStorePlugin)
public class SecureStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SecureStorePlugin"
    public let jsName = "SecureStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]
    private let service = "com.alllever.asset.secure"
    private let installedKey = "alv.secure.installed"

    private func key(_ call: CAPPluginCall) -> String? {
        guard let k = call.getString("key"), k.range(of: "^[a-z]{1,32}$", options: .regularExpression) != nil else {
            call.reject("잘못된 요청이에요", "bad_args"); return nil
        }
        return k
    }
    private func base(_ k: String) -> [String: Any] {
        return [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: k]
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let k = key(call) else { return }
        if !UserDefaults.standard.bool(forKey: installedKey) {   // 새로 설치: 예전 설치에서 남은 값은 지워요
            SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service] as CFDictionary)
            UserDefaults.standard.set(true, forKey: installedKey)
            call.resolve(["value": NSNull()]); return
        }
        var q = base(k); q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        let st = SecItemCopyMatching(q as CFDictionary, &out)
        if st == errSecSuccess, let d = out as? Data, let v = String(data: d, encoding: .utf8) { call.resolve(["value": v]) }
        else if st == errSecItemNotFound { call.resolve(["value": NSNull()]) }
        else { call.reject("키체인을 읽지 못했어요 (\(st))", "failed") }
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let k = key(call) else { return }
        guard let v = call.getString("value"), !v.isEmpty, v.count <= 512 else { call.reject("잘못된 요청이에요", "bad_args"); return }
        UserDefaults.standard.set(true, forKey: installedKey)
        SecItemDelete(base(k) as CFDictionary)
        var q = base(k)
        q[kSecValueData as String] = Data(v.utf8)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let st = SecItemAdd(q as CFDictionary, nil)
        if st == errSecSuccess { call.resolve() } else { call.reject("키체인에 저장하지 못했어요 (\(st))", "failed") }
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let k = key(call) else { return }
        SecItemDelete(base(k) as CFDictionary)
        call.resolve()
    }
}

// 앱 잠금: 기기의 Face ID·Touch ID (실패하면 기기 암호). 얼굴·지문 정보는 앱이 받지 않고 성공/실패만 받아요.
@objc(BiometricPlugin)
public class BiometricPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BiometricPlugin"
    public let jsName = "Biometric"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "check", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPrivacy", returnType: CAPPluginReturnPromise)
    ]
    static var privacyOn = UserDefaults.standard.bool(forKey: "alv.privacy")

    @objc func check(_ call: CAPPluginCall) {
        let ctx = LAContext(); var err: NSError?
        let bio = ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err)
        let any = LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
        var type = "none"
        switch ctx.biometryType {
        case .faceID: type = "faceID"
        case .touchID: type = "touchID"
        default: if #available(iOS 17.0, *), ctx.biometryType == .opticID { type = "opticID" }
        }
        call.resolve(["available": any, "biometrics": bio, "type": type])
    }

    @objc func authenticate(_ call: CAPPluginCall) {
        let reason = call.getString("reason") ?? "머니머슬 잠금 해제"
        let ctx = LAContext(); ctx.localizedCancelTitle = "취소"
        ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { ok, error in
            DispatchQueue.main.async {
                if ok { call.resolve(["ok": true]); return }
                let code = (error as? LAError)?.code
                if code == .userCancel || code == .appCancel || code == .systemCancel { call.reject("취소했어요", "canceled") }
                else if code == .passcodeNotSet { call.reject("기기 암호가 설정돼 있지 않아요", "unavailable") }
                else { call.reject(error?.localizedDescription ?? "인증하지 못했어요", "failed") }
            }
        }
    }

    @objc func setPrivacy(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? false
        BiometricPlugin.privacyOn = on
        UserDefaults.standard.set(on, forKey: "alv.privacy")
        call.resolve()
    }
}

// 구글 로그인·시트 선택을 애플이 권장하는 로그인 창(ASWebAuthenticationSession)으로 열고,
// com.alllever.asset:// 주소로 돌아오면 그 주소를 앱(JS)에 넘겨줘요.
@objc(WebAuthPlugin)
public class WebAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "WebAuthPlugin"
    public let jsName = "WebAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise)
    ]
    private var session: ASWebAuthenticationSession?

    @objc func start(_ call: CAPPluginCall) {
        guard let s = call.getString("url"), let url = URL(string: s), url.scheme == "https",
              let scheme = call.getString("scheme"), !scheme.isEmpty else {
            call.reject("잘못된 요청이에요", "bad_args"); return
        }
        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { [weak self] callback, error in
                self?.session = nil
                if let callback = callback {
                    call.resolve(["url": callback.absoluteString])
                } else if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin {
                    call.reject("로그인 창을 닫았어요", "canceled")
                } else {
                    call.reject(error?.localizedDescription ?? "로그인 창을 열지 못했어요", "failed")
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false   // 사파리의 구글 로그인 상태를 같이 써요 (시트 선택에 필요)
            self.session = session
            if !session.start() { self.session = nil; call.reject("로그인 창을 열지 못했어요", "failed") }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}
