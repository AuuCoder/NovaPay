plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val releaseKeystorePath = providers.environmentVariable("NOVAPAY_ANDROID_KEYSTORE_FILE").orNull
val releaseKeystorePassword = providers.environmentVariable("NOVAPAY_ANDROID_KEYSTORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("NOVAPAY_ANDROID_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("NOVAPAY_ANDROID_KEY_PASSWORD").orNull
val releaseSigningProvided = listOf(
    releaseKeystorePath,
    releaseKeystorePassword,
    releaseKeyAlias,
    releaseKeyPassword,
).all { !it.isNullOrBlank() }

if (gradle.startParameter.taskNames.any { it.contains("Release", ignoreCase = true) } && !releaseSigningProvided) {
    throw GradleException("Release signing environment variables are required.")
}

android {
    namespace = "com.novapay.ctfcaptureandroid"
    compileSdk = 35

    buildFeatures {
        buildConfig = true
    }

    defaultConfig {
        applicationId = "com.novapay.ctfcaptureandroid"
        minSdk = 26
        targetSdk = 35
        versionCode = 8
        versionName = "0.1.7"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        create("release") {
            if (releaseSigningProvided) {
                storeFile = file(releaseKeystorePath!!)
                storePassword = releaseKeystorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isDebuggable = false
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            buildConfigField("boolean", "ANTI_DEBUG_DEFAULT", "true")
            signingConfig = signingConfigs.getByName("release")
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            isMinifyEnabled = false
            buildConfigField("boolean", "ANTI_DEBUG_DEFAULT", "false")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
}
