package com.sonicheist.audio

import com.facebook.react.modules.network.OkHttpClientProvider
import java.net.Inet4Address
import java.net.InetAddress
import java.net.UnknownHostException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import okhttp3.Dns
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject

// Every fetch in the app goes through this client. React Native's default has no connect timeout and tries addresses in
// the order DNS gives them, so a phone whose IPv6 doesn't really work hangs on the first address until the request gives up.
object NetworkSetup {
    private const val CONNECT_TIMEOUT_S = 6L
    private const val DOH_TIMEOUT_S = 5L
    private val DOH_URLS = listOf("https://1.1.1.1/dns-query", "https://8.8.8.8/resolve")

    private val dohClient by lazy {
        OkHttpClient.Builder().callTimeout(DOH_TIMEOUT_S, TimeUnit.SECONDS).build()
    }
    private val dohCache = ConcurrentHashMap<String, List<InetAddress>>()

    fun install() {
        OkHttpClientProvider.setOkHttpClientFactory {
            PatrolLog.add("Network client ready")
            OkHttpClientProvider.createClientBuilder()
                .connectTimeout(CONNECT_TIMEOUT_S, TimeUnit.SECONDS)
                .dns(IPv4FirstDns)
                .build()
        }
    }

    private object IPv4FirstDns : Dns {
        override fun lookup(hostname: String): List<InetAddress> {
            val addresses = try {
                Dns.SYSTEM.lookup(hostname)
            } catch (e: UnknownHostException) {
                PatrolLog.add("Phone DNS failed for $hostname, trying DNS over HTTPS")
                lookupOverHttps(hostname) ?: throw e
            }
            return addresses.sortedBy { if (it is Inet4Address) 0 else 1 }
        }
    }

    // For networks whose DNS can't resolve a host: asks a public resolver over HTTPS, by IP so it needs no DNS itself.
    private fun lookupOverHttps(hostname: String): List<InetAddress>? {
        dohCache[hostname]?.let { return it }
        for (base in DOH_URLS) {
            try {
                val request = Request.Builder().url("$base?name=$hostname&type=A").header("Accept", "application/dns-json").build()
                val body = dohClient.newCall(request).execute().use { if (it.isSuccessful) it.body?.string() else null } ?: continue
                val answers = JSONObject(body).optJSONArray("Answer") ?: continue
                val found = (0 until answers.length())
                    .map { answers.getJSONObject(it) }
                    .filter { it.optInt("type") == 1 }
                    .map { InetAddress.getByAddress(hostname, parseIPv4(it.getString("data"))) }
                if (found.isNotEmpty()) {
                    dohCache[hostname] = found
                    return found
                }
            } catch (e: Exception) {
                PatrolLog.add("DNS over HTTPS failed at $base: ${e.javaClass.simpleName}")
            }
        }
        return null
    }

    private fun parseIPv4(text: String) = text.split('.').map { it.toInt().toByte() }.toByteArray()
}
