"use client";

import { useMutation } from "@tanstack/react-query";

import {
  postMaxbuyOverride,
  postMaxbuyPass,
  type MaxbuyOverrideRequest,
  type MaxbuyPassRequest,
} from "@/lib/app-api/client";

export function useMaxbuyOverride() {
  return useMutation({
    mutationFn: (body: MaxbuyOverrideRequest) => postMaxbuyOverride(body),
  });
}

export function useMaxbuyPass() {
  return useMutation({
    mutationFn: (body: MaxbuyPassRequest) => postMaxbuyPass(body),
  });
}
