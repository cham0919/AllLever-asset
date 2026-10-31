import UIKit
import Capacitor
import AuthenticationServices

// 앱 첫 화면: Capacitor 기본 화면에 우리 플러그인(WebAuth)을 등록해요. (Main.storyboard가 이 클래스를 써요)
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WebAuthPlugin())
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
