package com.alllever.asset;

import android.os.Build;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// 앱 잠금: 기기의 지문·얼굴·화면 잠금(PIN 등). 생체 정보는 앱이 받지 않고 성공/실패만 받아요.
@CapacitorPlugin(name = "Biometric")
public class BiometricPlugin extends Plugin {
    private static final int AUTH = BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    @PluginMethod
    public void check(PluginCall call) {
        BiometricManager bm = BiometricManager.from(getContext());
        JSObject r = new JSObject();
        r.put("available", bm.canAuthenticate(AUTH) == BiometricManager.BIOMETRIC_SUCCESS);
        r.put("biometrics", bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK) == BiometricManager.BIOMETRIC_SUCCESS);
        r.put("type", "biometric");
        call.resolve(r);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        String reason = call.getString("reason", "머니머슬 잠금 해제");
        getActivity().runOnUiThread(() -> {
            BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle("머니머슬")
                .setSubtitle(reason)
                .setAllowedAuthenticators(AUTH)
                .build();
            BiometricPrompt prompt = new BiometricPrompt((FragmentActivity) getActivity(), ContextCompat.getMainExecutor(getContext()),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                        JSObject r = new JSObject(); r.put("ok", true); call.resolve(r);
                    }
                    @Override public void onAuthenticationError(int code, CharSequence msg) {
                        boolean cancel = code == BiometricPrompt.ERROR_USER_CANCELED || code == BiometricPrompt.ERROR_CANCELED || code == BiometricPrompt.ERROR_NEGATIVE_BUTTON;
                        boolean none = code == BiometricPrompt.ERROR_NO_DEVICE_CREDENTIAL || code == BiometricPrompt.ERROR_NO_BIOMETRICS || code == BiometricPrompt.ERROR_HW_NOT_PRESENT;
                        call.reject(msg.toString(), cancel ? "canceled" : none ? "unavailable" : "failed");
                    }
                });
            prompt.authenticate(info);
        });
    }

    // 앱 잠금을 켠 경우: 최근 앱 화면(앱 전환)에 내용이 보이지 않게 해요 (안드로이드 13 이상)
    @PluginMethod
    public void setPrivacy(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= 33) getActivity().setRecentsScreenshotEnabled(!on);
            call.resolve();
        });
    }
}
