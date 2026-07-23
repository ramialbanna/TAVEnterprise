"use client";

import { useCallback, useState } from "react";
import type { OpportunityDetail } from "@/lib/app-api/schemas";
import { formatMoney } from "@/lib/format";
import { formatRegion } from "@/lib/copy/opportunities-labels";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

function formatListingLocation(opportunity: OpportunityDetail): string | null {
  const city = opportunity.listingCity?.trim();
  const state = opportunity.listingState?.trim();
  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  if (state) return state;
  if (opportunity.region) return formatRegion(opportunity.region);
  return null;
}

/**
 * Item 62 — Facebook-style listing mirror (photos + seller text) on detail.
 */
export function OpportunityListingMirrorBlock({
  opportunity,
}: {
  opportunity: OpportunityDetail;
}) {
  const images = opportunity.listingImages ?? [];
  const description = opportunity.listingDescription?.trim();
  const location = formatListingLocation(opportunity);
  const seller = opportunity.listingSellerName?.trim();
  const hasCityState =
    Boolean(opportunity.listingCity?.trim()) || Boolean(opportunity.listingState?.trim());
  const hasMirrorContent =
    images.length > 0 || Boolean(description) || Boolean(seller) || hasCityState;

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const showPrev = useCallback(() => {
    setLightboxIndex((i) => (i === null || images.length === 0 ? i : (i + images.length - 1) % images.length));
  }, [images.length]);
  const showNext = useCallback(() => {
    setLightboxIndex((i) => (i === null || images.length === 0 ? i : (i + 1) % images.length));
  }, [images.length]);

  if (!hasMirrorContent && !opportunity.listingUrl) {
    return (
      <p className="text-sm text-muted-foreground">
        No marketplace listing text or photos yet — new scrapes with Apify photos/detail fetch will
        populate this block.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {images.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory">
          {images.map((src, index) => (
            <button
              key={`${src}-${index}`}
              type="button"
              className="relative h-36 w-48 shrink-0 snap-start overflow-hidden rounded-md border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setLightboxIndex(index)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- FB CDN URLs are external/expiring */}
              <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}

      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {seller ? (
          <div>
            <dt className="text-xs text-muted-foreground">Seller</dt>
            <dd className="text-sm font-medium">{seller}</dd>
          </div>
        ) : null}
        {location ? (
          <div>
            <dt className="text-xs text-muted-foreground">Location</dt>
            <dd className="text-sm font-medium">{location}</dd>
          </div>
        ) : null}
        {opportunity.price != null ? (
          <div>
            <dt className="text-xs text-muted-foreground">Asking price</dt>
            <dd className="text-sm font-medium tabular-nums">{formatMoney(opportunity.price)}</dd>
          </div>
        ) : null}
      </dl>

      {description ? (
        <div>
          <h4 className="mb-1 text-xs font-medium text-muted-foreground">Description</h4>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm font-sans">
            {description}
          </pre>
        </div>
      ) : null}

      {opportunity.listingUrl ? (
        <Button variant="outline" size="sm" asChild>
          <a href={opportunity.listingUrl} target="_blank" rel="noopener noreferrer">
            View on Facebook
            <ExternalLink className="ml-2 h-3.5 w-3.5" aria-hidden />
          </a>
        </Button>
      ) : null}

      <Dialog open={lightboxIndex !== null} onOpenChange={(open) => !open && closeLightbox()}>
        <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="text-base">
              Photo {lightboxIndex !== null ? lightboxIndex + 1 : 0} of {images.length}
            </DialogTitle>
          </DialogHeader>
          {lightboxIndex !== null && images[lightboxIndex] ? (
            <div className="relative flex items-center justify-center bg-black/90 px-12 py-4">
              {images.length > 1 ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/10"
                    onClick={showPrev}
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/10"
                    onClick={showNext}
                    aria-label="Next photo"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                </>
              ) : null}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={images[lightboxIndex]}
                alt=""
                className="max-h-[70vh] max-w-full object-contain"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
