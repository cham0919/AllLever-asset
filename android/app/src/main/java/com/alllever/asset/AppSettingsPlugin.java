package com.alllever.asset;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// 휴대폰 설정 › 머니머슬 (알림) 화면 열기
@CapacitorPlugin(name = "AppSettings")
public class AppSettingsPlugin extends Plugin {
    @PluginMethod
    public void open(PluginCall call) {
        String pkg = getContext().getPackageName();
        Intent i;
        if ("notifications".equals(call.getString("page")) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
        } else {
            i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { getContext().startActivity(i); call.resolve(); } catch (Exception e) { call.reject("설정을 열 수 없어요"); }
    }
}
