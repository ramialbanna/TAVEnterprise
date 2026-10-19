import { describe, expect, it } from "vitest";

import {
  contactVehicleKey,
  copyTemplateKey,
  extractListingContactKeys,
  phoneKeyFromDigits,
} from "../listingContactKeys";

describe("extractListingContactKeys", () => {
  it("treats spaced, dotted, and bare US numbers as the same phone", () => {
    expect(extractListingContactKeys({ description: "Call (214) 555-1212" })).toEqual([
      "phone:2145551212",
    ]);
    expect(extractListingContactKeys({ description: "text 214.555.1212" })).toEqual([
      "phone:2145551212",
    ]);
    expect(extractListingContactKeys({ description: "2145551212" })).toEqual(["phone:2145551212"]);
    expect(extractListingContactKeys({ description: "+1 214-555-1212" })).toEqual([
      "phone:2145551212",
    ]);
  });

  it("turns a WhatsApp link into that same phone", () => {
    expect(
      extractListingContactKeys({ description: "Message https://wa.me/12145551212" }),
    ).toEqual(["phone:2145551212"]);
  });

  it("keeps a website, and ignores Facebook and mileage", () => {
    expect(
      extractListingContactKeys({
        title: "2018 Ford F-150",
        description: "85,000 miles. See https://www.joesautos.com/inventory and https://facebook.com/marketplace/item/1",
      }),
    ).toEqual(["url:joesautos.com"]);
  });

  it("keeps an email and a WhatsApp group link", () => {
    const keys = extractListingContactKeys({
      description: "Email SALES@JoesAutos.com or https://chat.whatsapp.com/InviteABC",
    });
    expect(keys).toEqual(
      expect.arrayContaining(["email:sales@joesautos.com", "url:chat.whatsapp.com/inviteabc"]),
    );
  });

  it("ignores a short private-party line", () => {
    expect(
      extractListingContactKeys({
        title: "2016 Honda CR-V",
        description: "Clean title, one owner.",
      }),
    ).toEqual([]);
  });

  it("does not read a year, a price, or a VIN as a phone", () => {
    expect(phoneKeyFromDigits("2018")).toBeNull();
    expect(
      extractListingContactKeys({
        description: "Asking $12500. VIN 1HGCM82633A004352. 98000 miles.",
      }),
    ).toEqual([]);
  });
});

describe("copyTemplateKey", () => {
  it("ignores a short private-party line", () => {
    expect(copyTemplateKey("Clean title, one owner.")).toBeNull();
  });

  it("hashes the same long blurb after the year, price, miles, and phone change", () => {
    const left = copyTemplateKey(
      "2019 We finance everyone. Bad credit is welcome. Come see the lot on Harry Hines today and ask for the internet manager. Call (214) 555-1212. $12,500. 85,000 miles.",
    );
    const right = copyTemplateKey(
      "2021 We finance everyone. Bad credit is welcome. Come see the lot on Harry Hines today and ask for the internet manager. Call 469-555-0199. $9,900. 12000 miles.",
    );
    expect(left).toMatch(/^copy:[a-f0-9]{32}$/);
    expect(left).toBe(right);
  });
});

describe("contactVehicleKey", () => {
  it("collapses two posts of the same VIN into one car", () => {
    const vin = "1HGCM82633A004352";
    expect(contactVehicleKey("https://facebook.com/a", vin)).toBe(
      contactVehicleKey("https://facebook.com/b", vin.toLowerCase()),
    );
  });

  it("uses the listing URL when there is no VIN", () => {
    expect(contactVehicleKey("https://facebook.com/a", null)).toBe("url:https://facebook.com/a");
  });
});
