import { renderToReadableStream } from "react-dom/server";
import { RemixServer } from "@remix-run/react";
import { isbot } from "isbot";
import { FRAME_ANCESTORS } from "./utils/responseHeaders";

export default async function handleRequest(
    request,
    responseStatusCode,
    responseHeaders,
    remixContext
) {
    const body = await renderToReadableStream(
        <RemixServer context={remixContext} url={request.url} />,
        {
            signal: request.signal,
            onError(error) {
                console.error(error);
                responseStatusCode = 500;
            },
        }
    );

    if (isbot(request.headers.get("user-agent"))) {
        await body.allReady;
    }

    responseHeaders.set("Content-Type", "text/html");

    // Until now this app was embedded-only, so framing by Shopify was mandatory and framing
    // by anyone else was not really a question. It is now also a standalone site carrying a
    // session cookie, which makes the wizard clickjackable from any origin. One directive
    // covers both shells: `self` for the standalone Studio pages, the two Shopify origins for
    // the embedded admin. `frame-ancestors` is ignored in a `<meta>` tag, so it has to be set
    // here rather than in the document head.
    if (!responseHeaders.has("Content-Security-Policy")) {
        responseHeaders.set("Content-Security-Policy", FRAME_ANCESTORS);
    }

    return new Response(body, {
        headers: responseHeaders,
        status: responseStatusCode,
    });
}
