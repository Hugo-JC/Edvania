"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  BarChart3,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  Settings,
  ShoppingBag,
  Truck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { signOut } from "@/app/dashboard/actions";
import { PageEntrance } from "./motion-primitives";

export type WorkspaceSectionKey =
  | "dashboard"
  | "products"
  | "sales"
  | "purchases"
  | "cash"
  | "customers"
  | "whatsapp"
  | "reports"
  | "settings";

type NavItem = {
  key: WorkspaceSectionKey;
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  managerOnly?: boolean;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  manager: "Gestor",
  employee: "Operador",
};

export function WorkspaceShell({
  active,
  sectionTitle,
  storeId,
  storeName,
  role,
  children,
}: {
  active: WorkspaceSectionKey;
  sectionTitle: string;
  storeId: string;
  storeName: string;
  role: string;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const canManage = ["owner", "admin", "manager"].includes(role);
  const qs = storeId ? `?store=${encodeURIComponent(storeId)}` : "";

  const groups: NavGroup[] = [
    {
      title: "Operação Diária",
      items: [
        { key: "dashboard", label: "Painel", href: "/dashboard", icon: LayoutDashboard },
        { key: "products", label: "Produtos e stock", href: `/products${qs}`, icon: Package },
        { key: "sales", label: "Vendas", href: `/sales${qs}`, icon: ShoppingBag, managerOnly: true },
        { key: "purchases", label: "Compras", href: `/purchases${qs}`, icon: Truck, managerOnly: true },
        { key: "cash", label: "Caixa", href: `/cash${qs}`, icon: Wallet, managerOnly: true },
      ],
    },
    {
      title: "Relacionamento e Canal",
      items: [
        { key: "customers", label: "Clientes e fornecedores", href: `/customers${qs}`, icon: Users, managerOnly: true },
        { key: "whatsapp", label: "WhatsApp e assistente", href: `/whatsapp${qs}`, icon: MessageSquare, managerOnly: true },
      ],
    },
    {
      title: "Gestão",
      items: [
        { key: "reports", label: "Relatórios e auditoria", href: `/reports${qs}`, icon: BarChart3, managerOnly: true },
        { key: "settings", label: "Definições da loja", href: `/settings${qs}`, icon: Settings },
      ],
    },
  ];

  const mobileQuickNav = [
    { key: "dashboard" as const, label: "Painel", href: "/dashboard", icon: LayoutDashboard },
    { key: "products" as const, label: "Stock", href: `/products${qs}`, icon: Package },
    ...(canManage
      ? [
          { key: "sales" as const, label: "Vendas", href: `/sales${qs}`, icon: ShoppingBag },
          { key: "cash" as const, label: "Caixa", href: `/cash${qs}`, icon: Wallet },
        ]
      : [
          { key: "settings" as const, label: "Loja", href: `/settings${qs}`, icon: Settings },
        ]),
  ];

  const renderNav = (onNavigate?: () => void) => (
    <nav className="flex flex-col gap-6" aria-label="Navegação principal">
      {groups.map((group) => {
        const visibleItems = group.items.filter((item) => !item.managerOnly || canManage);
        if (!visibleItems.length) return null;
        return (
          <div key={group.title} className="flex flex-col gap-1">
            <p className="px-3 pb-1 text-[11px] font-bold tracking-wider text-[#4B5952] uppercase">
              {group.title}
            </p>
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.key === active;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex min-h-[44px] items-center gap-2.5 rounded-[10px] px-3 py-2 text-[14px] whitespace-nowrap transition-colors duration-150 ${
                    isActive
                      ? "bg-[#EAF4F0] font-semibold text-[#0F5340]"
                      : "font-medium text-[#2B3933] hover:bg-[#F0F3F0] hover:text-[#15201C]"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#F7F8F6] text-[#15201C] lg:flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-[256px] lg:shrink-0 lg:flex-col lg:border-r lg:border-[#E2E7E3] lg:bg-white">
        <div className="flex h-16 items-center border-b border-[#E2E7E3] px-6">
          <Link href="/" className="brand whitespace-nowrap">
            Edvânia
          </Link>
        </div>
        <div className="flex flex-1 flex-col justify-between overflow-y-auto px-3 py-5">
          {renderNav()}
          <div className="mt-6 border-t border-[#E2E7E3] px-3 pt-4">
            <p className="truncate text-[13px] font-semibold text-[#15201C]">{storeName}</p>
            <p className="mt-0.5 text-[12px] text-[#4B5952]">
              {ROLE_LABELS[role] ?? role} <span aria-hidden="true">·</span> AOA
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Menu de navegação">
          <div
            className="fixed inset-0 bg-[#15201C]/25 backdrop-blur-[1px]"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-50 flex w-[280px] max-w-[85vw] flex-col border-r border-[#E2E7E3] bg-white">
            <div className="flex h-16 items-center justify-between border-b border-[#E2E7E3] px-5">
              <Link href="/" className="brand whitespace-nowrap" onClick={() => setMobileOpen(false)}>
                Edvânia
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Fechar menu"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-[#2B3933] hover:bg-[#F0F3F0]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-5">{renderNav(() => setMobileOpen(false))}</div>
            <div className="border-t border-[#E2E7E3] px-5 py-4">
              <p className="truncate text-[13px] font-semibold text-[#15201C]">{storeName}</p>
              <p className="mt-0.5 text-[12px] text-[#4B5952]">
                {ROLE_LABELS[role] ?? role} <span aria-hidden="true">·</span> AOA
              </p>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Viewport */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-[#E2E7E3] bg-white/95 backdrop-blur-sm px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#C6D0C9] bg-[#F7F8F6] text-[#15201C] hover:bg-[#EEF3F0] lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 items-center gap-2 text-[13.5px]">
              <span className="hidden text-[#4B5952] sm:inline">{storeName}</span>
              <span className="hidden text-[#9AA69F] sm:inline" aria-hidden="true">
                /
              </span>
              <span className="truncate font-semibold text-[#15201C]">{sectionTitle}</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <span className="hidden text-[13px] font-medium text-[#4B5952] md:inline whitespace-nowrap">
              {ROLE_LABELS[role] ?? role}
            </span>
            <form action={signOut}>
              <button type="submit" className="quiet-button !min-h-[40px] !px-3 sm:!px-4">
                <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">Terminar sessão</span>
                <span className="sm:hidden">Sair</span>
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 px-4 pt-6 pb-24 sm:px-8 sm:pt-9 lg:pb-10">
          <PageEntrance className="mx-auto w-full max-w-[1060px]">{children}</PageEntrance>
        </main>
      </div>

      {/* Mobile Bottom Quick-Navigation Bar */}
      <nav
        aria-label="Atalhos móveis"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E2E7E3] bg-white/95 backdrop-blur-sm lg:hidden"
      >
        <div className="grid grid-cols-5">
          {mobileQuickNav.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === active;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-1.5 text-[11px] font-semibold no-underline transition-colors ${
                  isActive ? "text-[#146C53]" : "text-[#4B5952] hover:text-[#15201C]"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate max-w-full">{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-1.5 text-[11px] font-semibold text-[#4B5952] hover:text-[#15201C]"
          >
            <Menu className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Menu</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
