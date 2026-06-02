"use client";

import { useMutation } from "@tanstack/react-query";

import { postMaxbuyEvaluate, type MaxbuyEvaluateRequest } from "@/lib/app-api/client";

export function useMaxbuyEvaluate() {
  return useMutation({
    mutationFn: (body: MaxbuyEvaluateRequest) => postMaxbuyEvaluate(body),
  });
}
