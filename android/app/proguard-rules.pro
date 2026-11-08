# MoneyTrack Production ProGuard / R8 Rules

# Keep Line Numbers and Source File for production stack traces
-keepattributes SourceFile,LineNumberTable,*Annotation*
-renamesourcefileattribute SourceFile

# Capacitor Core and Plugins
-keep public class * extends com.getcapacitor.Plugin {
    public *;
}
-keep public class com.getcapacitor.** { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public *;
}

# MoneyTrack Native Plugins & Receivers
-keep class com.moneytrack.app.plugins.** { *; }
-keep class com.moneytrack.app.MainActivity { *; }
-keep class com.moneytrack.app.sms.SmsReceiver { *; }

# WorkManager Workers
-keep class * extends androidx.work.ListenableWorker {
    public <init>(android.content.Context, androidx.work.WorkerParameters);
}
-keep class com.moneytrack.app.sms.SyncWorker { *; }
-keep class com.moneytrack.app.sms.WeeklyReportWorker { *; }

# Models, Entities & JSON reflection targets
-keep class com.moneytrack.app.sms.TransactionRecord { *; }
-keep class com.moneytrack.app.sms.ParsedTransaction { *; }
-keep class com.moneytrack.app.sms.SmsSettings { *; }
-keep class com.moneytrack.app.sms.CandidateStatus { *; }
-keep class com.moneytrack.app.sms.TxnStatus { *; }
-keep class com.moneytrack.app.sms.TxnClassification { *; }
-keep class com.moneytrack.app.sms.EligibilityDecision { *; }

# Android Security & Keystore
-keep class androidx.security.crypto.** { *; }

# OkHttp & Networking
-dontwarn okhttp3.**
-dontwarn okio.**
