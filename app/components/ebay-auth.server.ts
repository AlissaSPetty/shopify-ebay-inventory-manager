/* ------------------------------------------------------------------ */
/*  Exchange an eBay authorization code for a user access token       */
/* ------------------------------------------------------------------ */
export async function exchangeCodeForToken(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  [key: string]: unknown;
}> {
  const clientId = process.env.EBAY_CLIENT_ID!;
  const clientSecret = process.env.EBAY_CLIENT_SECRET!;
  const ruName = process.env.EBAY_RUNAME!;
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const resp = await fetch(
    "https://api.sandbox.ebay.com/identity/v1/oauth2/token",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: ruName,
      }),
    },
  );

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Token exchange failed (${resp.status}): ${text}`);
  }
  return JSON.parse(text);
}

/* ------------------------------------------------------------------ */
/*  Build the eBay OAuth consent URL                                  */
/* ------------------------------------------------------------------ */
export function buildEbayConsentUrl(): { authUrl: string } | { error: string } {
  const clientId = process.env.EBAY_CLIENT_ID;
  const ruName = process.env.EBAY_RUNAME;

  if (!clientId || !ruName) {
    return { error: "EBAY_CLIENT_ID or EBAY_RUNAME not set in .env" };
  }

  const scopes = [
    "https://api.ebay.com/oauth/api_scope",
    "https://api.ebay.com/oauth/api_scope/sell.inventory",
    "https://api.ebay.com/oauth/api_scope/sell.account",
  ];

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: ruName,
    response_type: "code",
    scope: scopes.join(" "),
  });

  return { authUrl: `https://auth.sandbox.ebay.com/oauth2/authorize?${params.toString()}` };
}
