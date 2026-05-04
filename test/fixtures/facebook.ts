// Synthetic Facebook marketplace item fixtures.
// makeFacebookItem() produces a minimal valid item; pass overrides for edge cases.

export interface FacebookItem {
  url: string;
  title: string;
  price?: string | number;
  mileage?: string | number;
  id?: string;
  [key: string]: unknown;
}

export function makeFacebookItem(overrides: Partial<FacebookItem> = {}): FacebookItem {
  return {
    url: "https://www.facebook.com/marketplace/item/100000000001",
    title: "2019 Toyota Camry SE 62k miles $18500",
    ...overrides,
  };
}

export const FACEBOOK_FIXTURES = {
  // Valid listings
  camry2019:    makeFacebookItem({ url: "https://www.facebook.com/marketplace/item/111", title: "2019 Toyota Camry SE 62k miles $18500" }),
  f150_2020:    makeFacebookItem({ url: "https://www.facebook.com/marketplace/item/222", title: "2020 Ford F-150 XLT 4WD 32000 miles $34000" }),
  civic2018:    makeFacebookItem({ url: "https://www.facebook.com/marketplace/item/333", title: "Honda Civic 2018 sport turbo 22k clean title $17500" }),
  silverado2017:makeFacebookItem({ url: "https://www.facebook.com/marketplace/item/444", title: "2017 Chevrolet Silverado 1500 LTZ crew cab $28000 68k miles" }),
  modelY2022:   makeFacebookItem({ url: "https://www.facebook.com/marketplace/item/555", title: "2022 Tesla Model Y Long Range AWD 15k miles $39000" }),

  // Edge cases
  priceInK:     makeFacebookItem({ url: "https://www.facebook.com/marketplace/item/601", title: "2021 Toyota RAV4 XLE 28k miles 32.5k" }),
  mileageInK:   makeFacebookItem({ url: "https://www.facebook.com/marketplace/item/602", title: "2020 Honda CR-V EX 45k miles $26000" }),
  noPrice:      makeFacebookItem({ url: "https://www.facebook.com/marketplace/item/603", title: "2018 Ford Fusion SE 55000 miles" }),
  noMileage:    makeFacebookItem({ url: "https://www.facebook.com/marketplace/item/604", title: "2019 Nissan Altima SV $15000" }),
  apostropheYear: makeFacebookItem({ url: "https://www.facebook.com/marketplace/item/605", title: "'21 Jeep Wrangler Unlimited Sport 4WD 30k $38000" }),

  // Duplicates (same identity_key)
  duplicate1:   makeFacebookItem({ url: "https://www.facebook.com/marketplace/item/701", title: "2019 Toyota Camry SE 61k miles $18200" }),
  duplicate2:   makeFacebookItem({ url: "https://www.facebook.com/marketplace/item/702", title: "2019 Toyota Camry SE 63k $18800" }),

  // Bad data — must reject
  missingUrl:   { title: "2019 Toyota Camry SE 62k miles $18500" },
  missingTitle: { url: "https://www.facebook.com/marketplace/item/801" },
  shortTitle:   makeFacebookItem({ title: "car" }),
  missingYmm:   makeFacebookItem({ url: "https://www.facebook.com/marketplace/item/802", title: "truck for sale great deal call me" }),
  tooOld:       makeFacebookItem({ url: "https://www.facebook.com/marketplace/item/803", title: "1985 Ford Mustang GT 80k miles $12000" }),
  tooNew:       makeFacebookItem({ url: "https://www.facebook.com/marketplace/item/804", title: "2050 Toyota Camry 10k miles $25000" }),
  freePrice:    makeFacebookItem({ url: "https://www.facebook.com/marketplace/item/805", title: "2019 Toyota Camry SE free must go today" }),
};
