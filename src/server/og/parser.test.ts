import { describe, expect, it } from "vitest";
import { parseProductMetadata } from "./parser";

const PAGE_URL = "https://retailer.example/products/widget";

function html(head: string, body = ""): string {
  return `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
}

const jsonLd = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

describe("parseProductMetadata — a page with no metadata at all", () => {
  it("resolves every field to null instead of throwing", () => {
    const result = parseProductMetadata(html(""), PAGE_URL);
    expect(result).toEqual({
      title: null,
      description: null,
      imageUrl: null,
      siteName: "retailer.example",
      priceAmount: null,
      priceCurrency: null,
    });
  });
});

describe("parseProductMetadata — title precedence", () => {
  it("falls back to <title> when nothing else is present", () => {
    const result = parseProductMetadata(html("<title>Plain Title</title>"), PAGE_URL);
    expect(result.title).toBe("Plain Title");
  });

  it("prefers JSON-LD name over the <title> tag", () => {
    const result = parseProductMetadata(
      html(`<title>Plain Title</title>${jsonLd({ "@type": "Product", name: "JSON-LD Name" })}`),
      PAGE_URL,
    );
    expect(result.title).toBe("JSON-LD Name");
  });

  it("prefers twitter:title over JSON-LD", () => {
    const result = parseProductMetadata(
      html(
        `<meta name="twitter:title" content="Twitter Title">${jsonLd({ "@type": "Product", name: "JSON-LD Name" })}`,
      ),
      PAGE_URL,
    );
    expect(result.title).toBe("Twitter Title");
  });

  it("prefers og:title above everything else", () => {
    const result = parseProductMetadata(
      html(
        `<meta property="og:title" content="OG Title">` +
          `<meta name="twitter:title" content="Twitter Title">` +
          jsonLd({ "@type": "Product", name: "JSON-LD Name" }) +
          `<title>Plain Title</title>`,
      ),
      PAGE_URL,
    );
    expect(result.title).toBe("OG Title");
  });
});

describe("parseProductMetadata — description precedence", () => {
  it("falls back through twitter, JSON-LD, then <meta name=description>", () => {
    expect(
      parseProductMetadata(html(`<meta name="description" content="Plain meta desc">`), PAGE_URL)
        .description,
    ).toBe("Plain meta desc");

    expect(
      parseProductMetadata(
        html(jsonLd({ "@type": "Product", description: "JSON-LD desc" })),
        PAGE_URL,
      ).description,
    ).toBe("JSON-LD desc");

    expect(
      parseProductMetadata(html(`<meta name="twitter:description" content="Twitter desc">`), PAGE_URL)
        .description,
    ).toBe("Twitter desc");
  });

  it("prefers og:description above everything else", () => {
    const result = parseProductMetadata(
      html(
        `<meta property="og:description" content="OG desc">` +
          `<meta name="twitter:description" content="Twitter desc">`,
      ),
      PAGE_URL,
    );
    expect(result.description).toBe("OG desc");
  });
});

describe("parseProductMetadata — image precedence and resolution", () => {
  it("prefers og:image:secure_url over og:image", () => {
    const result = parseProductMetadata(
      html(
        `<meta property="og:image:secure_url" content="https://cdn.example/secure.jpg">` +
          `<meta property="og:image" content="https://cdn.example/plain.jpg">`,
      ),
      PAGE_URL,
    );
    expect(result.imageUrl).toBe("https://cdn.example/secure.jpg");
  });

  it("falls back through twitter:image and twitter:image:src", () => {
    expect(
      parseProductMetadata(html(`<meta name="twitter:image" content="https://cdn.example/tw.jpg">`), PAGE_URL)
        .imageUrl,
    ).toBe("https://cdn.example/tw.jpg");

    expect(
      parseProductMetadata(
        html(`<meta name="twitter:image:src" content="https://cdn.example/tw-src.jpg">`),
        PAGE_URL,
      ).imageUrl,
    ).toBe("https://cdn.example/tw-src.jpg");
  });

  it("reads a JSON-LD image given as a plain string, an array, or an ImageObject", () => {
    expect(
      parseProductMetadata(html(jsonLd({ "@type": "Product", image: "https://cdn.example/a.jpg" })), PAGE_URL)
        .imageUrl,
    ).toBe("https://cdn.example/a.jpg");

    expect(
      parseProductMetadata(
        html(jsonLd({ "@type": "Product", image: ["https://cdn.example/b.jpg", "https://cdn.example/c.jpg"] })),
        PAGE_URL,
      ).imageUrl,
    ).toBe("https://cdn.example/b.jpg");

    expect(
      parseProductMetadata(
        html(jsonLd({ "@type": "Product", image: { url: "https://cdn.example/d.jpg" } })),
        PAGE_URL,
      ).imageUrl,
    ).toBe("https://cdn.example/d.jpg");
  });

  it("resolves a relative image URL against the page URL", () => {
    const result = parseProductMetadata(html(`<meta property="og:image" content="/img/widget.jpg">`), PAGE_URL);
    expect(result.imageUrl).toBe("https://retailer.example/img/widget.jpg");
  });

  it("resolves to null rather than throwing on a genuinely malformed image URL", () => {
    // Most odd-looking strings just resolve as a relative path against
    // pageUrl (WHATWG URL parsing is permissive) — "http://" is one of the
    // few that genuinely throws, confirmed with a throwaway node -e check.
    const result = parseProductMetadata(html(`<meta property="og:image" content="http://">`), PAGE_URL);
    expect(result.imageUrl).toBeNull();
  });
});

describe("parseProductMetadata — site name", () => {
  it("uses og:site_name when present", () => {
    const result = parseProductMetadata(html(`<meta property="og:site_name" content="Retailer">`), PAGE_URL);
    expect(result.siteName).toBe("Retailer");
  });

  it("falls back to the page URL's hostname", () => {
    const result = parseProductMetadata(html(""), PAGE_URL);
    expect(result.siteName).toBe("retailer.example");
  });
});

describe("parseProductMetadata — price precedence", () => {
  it("resolves a JSON-LD single Offer", () => {
    const result = parseProductMetadata(
      html(jsonLd({ "@type": "Product", offers: { "@type": "Offer", price: "49.99", priceCurrency: "USD" } })),
      PAGE_URL,
    );
    expect(result).toMatchObject({ priceAmount: "49.99", priceCurrency: "USD" });
  });

  it("resolves the first Offer of a JSON-LD offers array", () => {
    const result = parseProductMetadata(
      html(
        jsonLd({
          "@type": "Product",
          offers: [
            { "@type": "Offer", price: "19.99", priceCurrency: "USD" },
            { "@type": "Offer", price: "17.99", priceCurrency: "USD" },
          ],
        }),
      ),
      PAGE_URL,
    );
    expect(result).toMatchObject({ priceAmount: "19.99", priceCurrency: "USD" });
  });

  it("resolves a JSON-LD AggregateOffer via lowPrice", () => {
    const result = parseProductMetadata(
      html(
        jsonLd({
          "@type": "Product",
          offers: { "@type": "AggregateOffer", lowPrice: "9.99", priceCurrency: "USD" },
        }),
      ),
      PAGE_URL,
    );
    expect(result).toMatchObject({ priceAmount: "9.99", priceCurrency: "USD" });
  });

  it("falls back to OG product:price:amount/currency", () => {
    const result = parseProductMetadata(
      html(
        `<meta property="product:price:amount" content="129.00">` +
          `<meta property="product:price:currency" content="usd">`,
      ),
      PAGE_URL,
    );
    expect(result).toMatchObject({ priceAmount: "129.00", priceCurrency: "USD" });
  });

  it("falls back to a Twitter label/data pair carrying an explicit currency code", () => {
    const result = parseProductMetadata(
      html(
        `<meta name="twitter:label1" content="Price">` + `<meta name="twitter:data1" content="USD 49.99">`,
      ),
      PAGE_URL,
    );
    expect(result).toMatchObject({ priceAmount: "49.99", priceCurrency: "USD" });
  });

  it("does not resolve a Twitter price with only a bare $ — ambiguous between USD and COP", () => {
    const result = parseProductMetadata(
      html(`<meta name="twitter:label1" content="Price">` + `<meta name="twitter:data1" content="$49.99">`),
      PAGE_URL,
    );
    expect(result).toMatchObject({ priceAmount: null, priceCurrency: null });
  });

  it("prefers JSON-LD over OG over Twitter when more than one is present", () => {
    const result = parseProductMetadata(
      html(
        jsonLd({ "@type": "Product", offers: { price: "10.00", priceCurrency: "USD" } }) +
          `<meta property="product:price:amount" content="20.00">` +
          `<meta property="product:price:currency" content="USD">` +
          `<meta name="twitter:label1" content="Price">` +
          `<meta name="twitter:data1" content="USD 30.00">`,
      ),
      PAGE_URL,
    );
    expect(result.priceAmount).toBe("10.00");
  });

  it("skips a candidate missing either half of the amount/currency pair", () => {
    const result = parseProductMetadata(
      html(
        jsonLd({ "@type": "Product", offers: { price: "10.00" } }) + // no priceCurrency
          `<meta property="product:price:amount" content="20.00">` +
          `<meta property="product:price:currency" content="USD">`,
      ),
      PAGE_URL,
    );
    expect(result).toMatchObject({ priceAmount: "20.00", priceCurrency: "USD" });
  });
});

describe("parseProductMetadata — amount format normalization", () => {
  const withAmount = (amount: string) =>
    parseProductMetadata(
      html(
        `<meta property="product:price:amount" content="${amount}">` +
          `<meta property="product:price:currency" content="USD">`,
      ),
      PAGE_URL,
    ).priceAmount;

  it("normalizes US-style comma thousands", () => {
    expect(withAmount("1,300,000.50")).toBe("1300000.50");
  });

  it("normalizes COP-style period thousands with a comma decimal", () => {
    expect(withAmount("1.300.000,50")).toBe("1300000.50");
  });

  it("normalizes COP-style period thousands with no decimal", () => {
    expect(withAmount("1.300.000")).toBe("1300000");
  });

  it("passes through a plain decimal unchanged", () => {
    expect(withAmount("49.99")).toBe("49.99");
  });

  it("rejects a zero or negative amount", () => {
    expect(withAmount("0")).toBeNull();
    expect(withAmount("-5.00")).toBeNull();
  });

  it("rejects more than 12 integer digits", () => {
    expect(withAmount("1234567890123")).toBeNull();
  });

  it("rejects more than 2 decimal places", () => {
    // "49.999" is deliberately NOT used here: a lone NN.NNN shape is
    // genuinely ambiguous between "3 decimal places" and COP-style
    // thousands notation (49.999 = forty-nine thousand, nine hundred
    // ninety-nine pesos — a perfectly ordinary real price), and the parser
    // resolves that ambiguity toward thousands notation. Four decimal
    // digits doesn't fit either format's shape, so it's unambiguous.
    expect(withAmount("49.9999")).toBeNull();
  });

  it("rejects a value that doesn't confidently match any known format", () => {
    expect(withAmount("about $50")).toBeNull();
  });
});

describe("parseProductMetadata — malformed JSON-LD", () => {
  it("skips an unparseable script block instead of failing the whole parse", () => {
    const result = parseProductMetadata(
      html(`<script type="application/ld+json">{not valid json</script>` + `<meta property="og:title" content="Still works">`),
      PAGE_URL,
    );
    expect(result.title).toBe("Still works");
  });

  it("skips a block with no Product type and finds one in a later block", () => {
    const result = parseProductMetadata(
      html(
        jsonLd({ "@type": "BreadcrumbList", itemListElement: [] }) +
          jsonLd({ "@type": "Product", name: "Found It" }),
      ),
      PAGE_URL,
    );
    expect(result.title).toBe("Found It");
  });

  it("finds a Product nested in an @graph array", () => {
    const result = parseProductMetadata(
      html(jsonLd({ "@graph": [{ "@type": "WebPage" }, { "@type": "Product", name: "Graph Product" }] })),
      PAGE_URL,
    );
    expect(result.title).toBe("Graph Product");
  });

  it("falls through to other sources when a JSON-LD array has no Product anywhere in it", () => {
    const result = parseProductMetadata(
      html(
        jsonLd([{ "@type": "BreadcrumbList" }, { "@type": "WebPage" }]) +
          `<meta property="og:title" content="Fallback Title">`,
      ),
      PAGE_URL,
    );
    expect(result.title).toBe("Fallback Title");
  });
});

describe("parseProductMetadata — malformed page URL", () => {
  it("resolves siteName to null instead of throwing when pageUrl itself is invalid", () => {
    const result = parseProductMetadata(html(""), "not a url");
    expect(result.siteName).toBeNull();
  });
});

describe("parseProductMetadata — sanitization", () => {
  it("strips tag-like content and collapses whitespace", () => {
    const result = parseProductMetadata(
      html(`<meta property="og:title" content="Nice   <b>Widget</b>\n\twith   spaces">`),
      PAGE_URL,
    );
    expect(result.title).toBe("Nice Widget with spaces");
  });

  it("truncates an extremely long title rather than storing it whole", () => {
    const longTitle = "A".repeat(5000);
    const result = parseProductMetadata(html(`<meta property="og:title" content="${longTitle}">`), PAGE_URL);
    expect(result.title).toHaveLength(300);
  });

  it("strips control characters", () => {
    const result = parseProductMetadata(
      html(`<meta property="og:title" content="Weird TitleHere">`),
      PAGE_URL,
    );
    expect(result.title).toBe("WeirdTitleHere");
  });
});
