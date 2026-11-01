package com.moneytrack.app

import android.content.Intent
import android.os.Bundle
import com.getcapacitor.BridgeActivity
import com.moneytrack.app.plugins.SmsPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(SmsPlugin::class.java)
        super.onCreate(savedInstanceState)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent.dataString?.let { uriString ->
            val plugin = bridge?.getPlugin("SmsPlugin")?.instance as? SmsPlugin
            plugin?.handleDeepLink(uriString)
        }
    }
}
