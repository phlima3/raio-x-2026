import Script from 'next/script'

/**
 * Umami, medicao de audiencia sem cookie.
 *
 * O `data-website-id` e publico por natureza -- vai no HTML de qualquer forma.
 * Vem de variavel de ambiente mesmo assim, para que rodar local ou em preview
 * nao suje a contagem do site publico: sem a variavel, o script nao carrega.
 */
function Umami() {
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID
  if (!websiteId || !/^[0-9a-f-]{36}$/i.test(websiteId)) return null
  const src = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL ?? 'https://cloud.umami.is/script.js'

  return <Script src={src} data-website-id={websiteId} strategy="afterInteractive" defer />
}

export function Analytics() {
  return (
    <>
      <Umami />
      <GoogleAnalytics />
    </>
  )
}

function GoogleAnalytics() {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
  if (!measurementId || !/^G-[A-Z0-9]+$/.test(measurementId)) return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="ga4" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config',${JSON.stringify(measurementId)},{anonymize_ip:true});`}
      </Script>
    </>
  )
}
