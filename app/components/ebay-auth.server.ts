import prisma from "../db.server";

interface EbayTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/*  Exchange an eBay authorization code for a user access token       */
/* ------------------------------------------------------------------ */
export async function exchangeCodeForToken(code: string): Promise<EbayTokenResponse> {
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

/* ------------------------------------------------------------------ */
/*  Persist tokens to the database after a successful exchange        */
/* ------------------------------------------------------------------ */
export async function saveEbayToken(
  shop: string,
  tokenData: EbayTokenResponse,
): Promise<void> {
  const expiresIn = tokenData.expires_in ?? 7200; // default 2 h
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  await prisma.ebayToken.upsert({
    where: { shop },
    update: {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? "",
      expiresAt,
    },
    create: {
      shop,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? "",
      expiresAt,
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Retrieve a stored token record for a shop                         */
/* ------------------------------------------------------------------ */
export async function getStoredEbayToken(shop: string) {
  return prisma.ebayToken.findUnique({ where: { shop } });
}

/* ------------------------------------------------------------------ */
/*  Use a refresh token to obtain a new access token silently         */
/* ------------------------------------------------------------------ */
export async function refreshAccessToken(refreshToken: string): Promise<EbayTokenResponse> {
  const clientId = process.env.EBAY_CLIENT_ID!;
  const clientSecret = process.env.EBAY_CLIENT_SECRET!;
  const scopes = [
    "https://api.ebay.com/oauth/api_scope",
    "https://api.ebay.com/oauth/api_scope/sell.inventory",
    "https://api.ebay.com/oauth/api_scope/sell.account",
  ];
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
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: scopes.join(" "),
      }),
    },
  );

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Token refresh failed (${resp.status}): ${text}`);
  }
  return JSON.parse(text);
}

/* ------------------------------------------------------------------ */
/*  High-level helper: get a valid access token for a shop.           */
/*  Uses stored refresh token when possible, avoiding full re-auth.   */
/* ------------------------------------------------------------------ */
export async function getAccessToken(
  shop: string,
  code?: string | null,
): Promise<{ accessToken: string; fromRefresh: boolean }> {
  // 1. If an auth code was provided, always exchange it (fresh login)
  if (code) {
    const tokenData = await exchangeCodeForToken(code);
    await saveEbayToken(shop, tokenData);
    return { accessToken: tokenData.access_token, fromRefresh: false };
  }

  // 2. Try to use a stored refresh token
  const stored = await getStoredEbayToken(shop);
  if (stored?.refreshToken) {
    console.log("Using stored refresh token for", shop);
    const tokenData = await refreshAccessToken(stored.refreshToken);
    await saveEbayToken(shop, { ...tokenData, refresh_token: tokenData.refresh_token ?? stored.refreshToken });
    return { accessToken: tokenData.access_token, fromRefresh: true };
  }

  // 3. No code and no stored token – caller must initiate OAuth
  throw new Error("NO_TOKEN");
}
