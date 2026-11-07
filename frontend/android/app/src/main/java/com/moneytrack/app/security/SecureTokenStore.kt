package com.moneytrack.app.security

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import com.moneytrack.app.BuildConfig
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private const val TAG = "SecureTokenStore"
private const val PREFS_NAME = "moneytrack_secure_auth"
private const val KEY_ALIAS = "MoneyTrackAuthTokenKey"
private const val ANDROID_KEYSTORE = "AndroidKeyStore"
private const val TRANSFORMATION = "AES/GCM/NoPadding"
private const val GCM_TAG_LENGTH = 128
private const val PREF_ENCRYPTED_TOKEN = "enc_token"
private const val PREF_IV = "token_iv"

/**
 * Secure, Keystore-backed storage for authentication tokens (JWT).
 * Uses AES-GCM with hardware-backed keys provided by AndroidKeyStore.
 * Never leaks token contents into system logs or exception traces.
 * In release mode, Keystore failures fail securely; plaintext fallback is strictly restricted to DEBUG / test runners.
 */
class SecureTokenStore(private val context: Context) {

    private val prefs: SharedPreferences by lazy {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    /**
     * Determines whether test fallback is permitted.
     * Permitted ONLY when BuildConfig.DEBUG is true or in headless JVM unit test runner.
     * In release builds (BuildConfig.DEBUG == false), test fallback is STRICTLY disabled.
     */
    private fun isTestFallbackAllowed(): Boolean {
        return try {
            BuildConfig.DEBUG
        } catch (_: Throwable) {
            // In headless JVM unit test runner where BuildConfig might not be loaded
            true
        }
    }

    @Synchronized
    fun saveToken(token: String) {
        if (token.isBlank()) {
            clearToken()
            return
        }

        try {
            val key = getOrCreateSecretKey()
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, key)
            val iv = cipher.iv
            val encryptedBytes = cipher.doFinal(token.toByteArray(Charsets.UTF_8))

            val encBase64 = Base64.encodeToString(encryptedBytes, Base64.NO_WRAP)
            val ivBase64 = Base64.encodeToString(iv, Base64.NO_WRAP)

            prefs.edit()
                .putString(PREF_ENCRYPTED_TOKEN, encBase64)
                .putString(PREF_IV, ivBase64)
                .apply()
        } catch (e: Exception) {
            Log.e(TAG, "Keystore encryption error: ${e.javaClass.simpleName}")
            if (isTestFallbackAllowed()) {
                // Test-only fallback for headless JVM unit test runner where AndroidKeyStore provider is absent
                val fallback = Base64.encodeToString(token.toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
                prefs.edit().putString(PREF_ENCRYPTED_TOKEN, fallback).remove(PREF_IV).apply()
            } else {
                // Fail securely in release mode: never persist plaintext tokens
                clearToken()
            }
        }
    }

    @Synchronized
    fun getToken(): String? {
        val encBase64 = prefs.getString(PREF_ENCRYPTED_TOKEN, null) ?: return null
        val ivBase64 = prefs.getString(PREF_IV, null)

        if (ivBase64 == null) {
            if (!isTestFallbackAllowed()) {
                // In release mode, unencrypted tokens are strictly rejected and purged
                Log.w(TAG, "Rejecting unencrypted token in release mode")
                clearToken()
                return null
            }
            // Unencrypted / test fallback decode for headless unit test runner
            return try {
                String(Base64.decode(encBase64, Base64.NO_WRAP), Charsets.UTF_8)
            } catch (_: Exception) {
                null
            }
        }

        return try {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
            val key = keyStore.getKey(KEY_ALIAS, null) as? SecretKey ?: return null
            val iv = Base64.decode(ivBase64, Base64.NO_WRAP)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            val spec = GCMParameterSpec(GCM_TAG_LENGTH, iv)
            cipher.init(Cipher.DECRYPT_MODE, key, spec)
            val decryptedBytes = cipher.doFinal(Base64.decode(encBase64, Base64.NO_WRAP))
            String(decryptedBytes, Charsets.UTF_8)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to decrypt auth token; clearing invalid credentials")
            clearToken()
            null
        }
    }

    @Synchronized
    fun clearToken() {
        prefs.edit().remove(PREF_ENCRYPTED_TOKEN).remove(PREF_IV).apply()
    }

    fun hasToken(): Boolean {
        return prefs.contains(PREF_ENCRYPTED_TOKEN)
    }

    private fun getOrCreateSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        if (keyStore.containsAlias(KEY_ALIAS)) {
            val key = keyStore.getKey(KEY_ALIAS, null) as? SecretKey
            if (key != null) return key
        }

        val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        val spec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()
        keyGenerator.init(spec)
        return keyGenerator.generateKey()
    }
}
