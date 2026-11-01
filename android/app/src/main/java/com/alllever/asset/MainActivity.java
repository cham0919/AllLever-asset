package com.alllever.asset;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BiometricPlugin.class);   // 앱 잠금 (지문·얼굴·PIN)
        registerPlugin(SecureStorePlugin.class); // 로그인 세션 값 보관 (키스토어 암호화)
        super.onCreate(savedInstanceState);
    }
}
