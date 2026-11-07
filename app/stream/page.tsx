import StreamClient from "./stream-client";

export const dynamic = "force-dynamic";

export default function StreamPage() {
  // Public by design: the PayPal JS SDK needs the client id in the browser.
  return <StreamClient clientId={process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? ""} />;
}
