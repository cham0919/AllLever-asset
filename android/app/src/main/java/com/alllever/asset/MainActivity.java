package com.alllever.asset;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BiometricPlugin.class);   // 앱 잠금 (지문·얼굴·PIN)
        super.onCreate(savedInstanceState);
    }
}
