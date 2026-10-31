import UIKit
import Capacitor
import AuthenticationServices
import LocalAuthentication

// 앱 첫 화면: Capacitor 기본 화면에 우리 플러그인(WebAuth)을 등록해요. (Main.storyboard가 이 클래스를 써요)
class MainViewController: CAPBridgeViewController {
    private var cover: UIView?

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WebAuthPlugin())
        bridge?.registerPluginInstance(BiometricPlugin())
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
