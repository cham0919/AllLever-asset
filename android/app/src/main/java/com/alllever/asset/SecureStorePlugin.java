package com.alllever.asset;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

// 로그인 세션 값 보관: 안드로이드 키스토어의 암호화 키(기기 밖으로 꺼낼 수 없어요)로 암호화해서 앱 저장 공간에 둬요.
@CapacitorPlugin(name = "SecureStore")
public class SecureStorePlugin extends Plugin {
    private static final String ALIAS = "alv_secure_key";
    private static final String PREFS = "alv_secure";

    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(ALIAS, null)).getSecretKey();
        KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        g.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build());
        return g.generateKey();
    }
    private SharedPreferences prefs() { return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    private String keyOf(PluginCall call) {
        String k = call.getString("key");
        if (k == null || !k.matches("^[a-z]{1,32}$")) { call.reject("잘못된 요청이에요", "bad_args"); return null; }
        return k;
    }

    @PluginMethod
    public void get(PluginCall call) {
        String k = keyOf(call); if (k == null) return;
        JSObject r = new JSObject();
        String stored = prefs().getString(k, null);
        if (stored == null) { r.put("value", JSObject.NULL); call.resolve(r); return; }
        try {
            String[] parts = stored.split("\\.");
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            r.put("value", new String(c.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8));
            call.resolve(r);
        } catch (Exception e) {   // 키가 바뀌었거나 손상됨: 지우고 다시 로그인하게 해요
            prefs().edit().remove(k).apply();
            r.put("value", JSObject.NULL); call.resolve(r);
        }
    }

    @PluginMethod
    public void set(PluginCall call) {
        String k = keyOf(call); if (k == null) return;
        String v = call.getString("value");
        if (v == null || v.isEmpty() || v.length() > 512) { call.reject("잘못된 요청이에요", "bad_args"); return; }
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key());
            String out = Base64.encodeToString(c.getIV(), Base64.NO_WRAP) + "." + Base64.encodeToString(c.doFinal(v.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            prefs().edit().putString(k, out).commit();
            call.resolve();
        } catch (Exception e) { call.reject("안전한 저장소에 저장하지 못했어요", "failed"); }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String k = keyOf(call); if (k == null) return;
        prefs().edit().remove(k).commit();
        call.resolve();
    }
}
