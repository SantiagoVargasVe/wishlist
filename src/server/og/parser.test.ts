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

  it("also reads og:title written with name= instead of property=", () => {
    // Non-compliant with the OG spec, but MDN's own docs pages do exactly
    // this — confirmed live against a real fetch, not assumed.
    const result = parseProductMetadata(html(`<meta name="og:title" content="Name-attr OG Title">`), PAGE_URL);
    expect(result.title).toBe("Name-attr OG Title");
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

describe("parseProductMetadata — vendor image fallback (T035)", () => {
  const AMAZON_URL = "https://www.amazon.com/dp/B0FK39FXJH";
  const landingImage = (map: Record<string, [number, number]>) =>
    `<img id="landingImage" data-a-dynamic-image='${JSON.stringify(map)}'>`;

  it("resolves imageUrl from Amazon's data-a-dynamic-image when no standard tag is present", () => {
    const result = parseProductMetadata(
      html("", landingImage({ "https://m.media-amazon.com/images/large.jpg": [1000, 1000] })),
      AMAZON_URL,
    );
    expect(result.imageUrl).toBe("https://m.media-amazon.com/images/large.jpg");
  });

  it("still prefers a standard og:image over the vendor fallback when both are present", () => {
    const result = parseProductMetadata(
      html(
        `<meta property="og:image" content="https://cdn.example/og.jpg">`,
        landingImage({ "https://m.media-amazon.com/images/large.jpg": [1000, 1000] }),
      ),
      AMAZON_URL,
    );
    expect(result.imageUrl).toBe("https://cdn.example/og.jpg");
  });

  it("resolves to null, not throwing, for an Amazon page with no dynamic-image attribute either", () => {
    const result = parseProductMetadata(html(""), AMAZON_URL);
    expect(result.imageUrl).toBeNull();
  });

  it("ignores the same data-a-dynamic-image attribute on a non-Amazon hostname", () => {
    const result = parseProductMetadata(
      html("", landingImage({ "https://cdn.example/large.jpg": [1000, 1000] })),
      PAGE_URL,
    );
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

// T085. Retailers routinely publish one `ProductGroup` for the garment with a
// `hasVariant` array of `Product`s beneath it, one per size/colour. Matching
// only `Product` walked past a price sitting in the HTML.
describe("parseProductMetadata — schema.org ProductGroup", () => {
  const variant = (price: string, availability: string, size: string) => ({
    "@type": "Product",
    name: `Jeans - ${size}`,
    size,
    offers: {
      "@type": "Offer",
      priceCurrency: "USD",
      price,
      availability: `https://schema.org/${availability}`,
    },
  });

  it("reads name, description and image off the group itself", () => {
    const result = parseProductMetadata(
      html(
        jsonLd({
          "@type": "ProductGroup",
          name: "Mom Fit Jeans",
          description: "High waist, regular length.",
          image: ["https://cdn.example/jeans.jpg"],
        }),
      ),
      PAGE_URL,
    );

    expect(result.title).toBe("Mom Fit Jeans");
    expect(result.description).toBe("High waist, regular length.");
    expect(result.imageUrl).toBe("https://cdn.example/jeans.jpg");
  });

  it("prefers the cheapest IN-STOCK variant, not the first one listed", () => {
    const result = parseProductMetadata(
      html(
        jsonLd({
          "@type": "ProductGroup",
          name: "Jeans",
          hasVariant: [
            variant("9.98", "OutOfStock", "25"), // cheapest overall, but unbuyable
            variant("49.90", "InStock", "27"),
            variant("39.90", "InStock", "26"),
            variant("19.90", "OutOfStock", "28"),
          ],
        }),
      ),
      PAGE_URL,
    );

    expect(result.priceAmount).toBe("39.90");
    expect(result.priceCurrency).toBe("USD");
  });

  it("falls back to the cheapest overall when no variant is in stock", () => {
    const result = parseProductMetadata(
      html(
        jsonLd({
          "@type": "ProductGroup",
          name: "Jeans",
          hasVariant: [variant("29.90", "OutOfStock", "25"), variant("19.90", "OutOfStock", "26")],
        }),
      ),
      PAGE_URL,
    );

    expect(result.priceAmount).toBe("19.90");
  });

  it("accepts a bare availability token as well as a schema.org URL", () => {
    const result = parseProductMetadata(
      html(
        jsonLd({
          "@type": "ProductGroup",
          hasVariant: [
            { "@type": "Product", offers: { price: "50.00", priceCurrency: "USD", availability: "InStock" } },
            { "@type": "Product", offers: { price: "10.00", priceCurrency: "USD", availability: "OutOfStock" } },
          ],
        }),
      ),
      PAGE_URL,
    );

    expect(result.priceAmount).toBe("50.00");
  });

  it("uses the group's own offers when it has them, without consulting variants", () => {
    const result = parseProductMetadata(
      html(
        jsonLd({
          "@type": "ProductGroup",
          offers: { "@type": "Offer", price: "99.00", priceCurrency: "USD" },
          hasVariant: [variant("10.00", "InStock", "25")],
        }),
      ),
      PAGE_URL,
    );

    expect(result.priceAmount).toBe("99.00");
  });

  it("finds a ProductGroup nested in @graph", () => {
    const result = parseProductMetadata(
      html(
        jsonLd({
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "BreadcrumbList" },
            { "@type": "ProductGroup", name: "Graph Jeans", hasVariant: [variant("25.00", "InStock", "25")] },
          ],
        }),
      ),
      PAGE_URL,
    );

    expect(result.title).toBe("Graph Jeans");
    expect(result.priceAmount).toBe("25.00");
  });

  it("matches the array form of @type", () => {
    const result = parseProductMetadata(
      html(jsonLd({ "@type": ["Thing", "ProductGroup"], name: "Array Typed" })),
      PAGE_URL,
    );

    expect(result.title).toBe("Array Typed");
  });

  it.each([
    ["hasVariant that isn't an array", { "@type": "ProductGroup", hasVariant: "nope" }],
    ["an empty hasVariant", { "@type": "ProductGroup", hasVariant: [] }],
    ["variants that aren't objects", { "@type": "ProductGroup", hasVariant: [null, 42, "x"] }],
    ["variants with no offers", { "@type": "ProductGroup", hasVariant: [{ "@type": "Product" }] }],
    [
      "offers with no price",
      { "@type": "ProductGroup", hasVariant: [{ "@type": "Product", offers: { priceCurrency: "USD" } }] },
    ],
    [
      "a non-numeric price",
      {
        "@type": "ProductGroup",
        hasVariant: [{ "@type": "Product", offers: { price: "ask us", priceCurrency: "USD" } }],
      },
    ],
  ])("resolves price to null for %s, rather than throwing", (_label, node) => {
    const result = parseProductMetadata(html(jsonLd(node)), PAGE_URL);
    expect(result.priceAmount).toBeNull();
    expect(result.priceCurrency).toBeNull();
  });

  it("still lets og tags outrank the group — precedence is unchanged", () => {
    const result = parseProductMetadata(
      html(
        `<meta property="og:title" content="OG Wins">` +
          `<meta property="og:image" content="https://cdn.example/og.jpg">` +
          jsonLd({
            "@type": "ProductGroup",
            name: "JSON-LD Loses",
            image: ["https://cdn.example/jsonld.jpg"],
          }),
      ),
      PAGE_URL,
    );

    expect(result.title).toBe("OG Wins");
    expect(result.imageUrl).toBe("https://cdn.example/og.jpg");
  });

  // The exact shape from a real Zara product page, captured 2026-08-25: all
  // eight size variants priced 9.98 USD and every one of them OutOfStock, so
  // this exercises the no-stock fallback on real data rather than a fixture
  // invented to match the code.
  it("extracts the price from the real Zara ProductGroup shape", () => {
    const sizes = ["25 (US 0)", "26 (US 2)", "27 (US 4)", "28 (US 6)"];
    const result = parseProductMetadata(
      html(
        jsonLd({
          "@context": "https://schema.org/",
          "@type": "ProductGroup",
          name: "HIGH-WAISTED TRF MOM FIT JEANS",
          productGroupID: "02569047",
          brand: { "@type": "Brand", name: "ZARA" },
          variesBy: ["https://schema.org/size", "https://schema.org/color"],
          image: ["https://static.zara.net/assets/public/03607047250-p.jpg?ts=1753280029623&w=1920"],
          hasVariant: sizes.map((size) => ({
            "@type": "Product",
            name: `HIGH-WAISTED TRF MOM FIT JEANS - White - ${size}`,
            sku: "545042665-250-32",
            color: "White",
            size,
            image: ["https://static.zara.net/assets/public/03607047250-p.jpg?ts=1753280029623&w=1920"],
            offers: {
              "@type": "Offer",
              priceCurrency: "USD",
              price: "9.98",
              itemCondition: "https://schema.org/NewCondition",
              availability: "https://schema.org/OutOfStock",
            },
          })),
        }),
      ),
      PAGE_URL,
    );

    expect(result.title).toBe("HIGH-WAISTED TRF MOM FIT JEANS");
    expect(result.priceAmount).toBe("9.98");
    expect(result.priceCurrency).toBe("USD");
  });
});

describe("parseProductMetadata — plain Product is unaffected by ProductGroup support", () => {
  it("still takes the first offer from a Product's own offers array", () => {
    const result = parseProductMetadata(
      html(
        jsonLd({
          "@type": "Product",
          name: "Widget",
          offers: [
            { "@type": "Offer", price: "20.00", priceCurrency: "USD" },
            { "@type": "Offer", price: "5.00", priceCurrency: "USD" },
          ],
        }),
      ),
      PAGE_URL,
    );

    // Deliberately NOT the cheapest — the in-stock/cheapest rule applies only
    // when descending into a ProductGroup's variants.
    expect(result.priceAmount).toBe("20.00");
  });
});
