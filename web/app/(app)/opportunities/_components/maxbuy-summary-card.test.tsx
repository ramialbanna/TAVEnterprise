import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { buildMockMaxbuyEvaluation } from "../../mmr-lab/_components/maxbuy-evaluation-mock";
import { MaxbuySummaryCard } from "./maxbuy-summary-card";

function renderCard(
  liveState: Parameters<typeof MaxbuySummaryCard>[0]["liveState"],
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MaxbuySummaryCard savedSummary={null} liveState={liveState} />
    </QueryClientProvider>,
  );
}

describe("MaxbuySummaryCard", () => {
  it("expands compact details without full MMR Lab evaluation section", async () => {
    const user = userEvent.setup();
    const display = buildMockMaxbuyEvaluation(
      { mmrValue: 23_900, adjustedMmr: 23_900 },
      { askingPrice: 12_500 },
    );

    renderCard({ kind: "ready", display });

    expect(screen.queryByText(/max buy evaluation/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /details/i }));

    expect(screen.queryByText(/max buy evaluation/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/recommended max buy/i)).not.toBeInTheDocument();
    expect(screen.getByText(/economics/i)).toBeInTheDocument();
    expect(screen.getByText(/tav segment history/i)).toBeInTheDocument();
  });
});
