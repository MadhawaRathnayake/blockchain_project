import { Header } from "./Header";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The header renders the RainbowKit connect button and gates the Admin link on
 * wallet ownership.
 */

const mocks = vi.hoisted(() => ({
  isOwner: false,
}));

vi.mock("~~/hooks/scaffold-eth", () => ({
  useIsVotingOwner: () => mocks.isOwner,
  useOutsideClick: () => {},
}));
vi.mock("~~/components/scaffold-eth", () => ({
  RainbowKitCustomConnectButton: () => <button type="button">Connect Wallet</button>,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
// A span rather than an <img>: the logo is irrelevant here, and next/core-web-vitals
// warns on raw <img> elements.
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  mocks.isOwner = false;
});

describe("Header", () => {
  it("renders the wallet connect button", () => {
    render(<Header />);

    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeDefined();
  });

  it("shows the Admin link only to the on-chain owner", () => {
    render(<Header />);
    expect(screen.queryAllByRole("link", { name: /admin/i })).toHaveLength(0);

    mocks.isOwner = true;
    render(<Header />);
    expect(screen.queryAllByRole("link", { name: /admin/i }).length).toBeGreaterThan(0);
  });
});
