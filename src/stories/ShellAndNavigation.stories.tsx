import type { Meta, StoryObj } from "@storybook/react";
import { CreditCard, Store, Users } from "lucide-react";
import { AccountMenu } from "@/components/AccountMenu";
import { BottomNav } from "@/components/BottomNav";
import { HomeHeader } from "@/components/HomeHeader";
import { HowItWorksSheet } from "@/components/HowItWorksSheet";
import { LanguageMenu } from "@/components/LanguageMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { UserLayout } from "@/components/layout/UserLayout";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import OperationalSection from "@/components/restaurant/OperationalSection";

const meta = {
  title: "App Components/Shell and Navigation",
  parameters: {
    docs: {
      description: {
        component: "Application chrome, account menu, language/theme controls, and admin/operations layout components.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const HeaderControls: Story = {
  render: () => (
    <div className="space-y-space-8">
      <div className="rounded-radius-lg bg-card p-space-6">
        <h2 className="mb-space-4 text-panel-title">Standalone controls</h2>
        <div className="flex items-center gap-space-4">
          <LanguageMenu />
          <ThemeToggle />
          <AccountMenu />
          <HowItWorksSheet />
        </div>
      </div>
      <div className="-mx-6">
        <DesktopHeader />
      </div>
    </div>
  ),
};

export const ResponsiveHeaders: Story = {
  render: () => (
    <div className="space-y-space-6">
      <div className="-mx-6">
        <HomeHeader />
      </div>
      <div className="rounded-radius-lg bg-card p-space-6">
        <p className="type-body text-muted-foreground">
          Mobile header and bottom navigation are responsive shell components; resize the preview to inspect behavior.
        </p>
      </div>
      <BottomNav />
    </div>
  ),
};

export const UserLayoutShell: Story = {
  render: () => (
    <UserLayout allowGuest title="Storybook Page" showBackButton breadcrumb="Preview">
      <div className="market-content py-space-10">
        <div className="rounded-radius-lg bg-card p-space-8">
          <h2 className="text-panel-title">User layout content</h2>
          <p className="mt-space-2 type-body text-muted-foreground">
            The layout owns desktop/mobile chrome, back affordances, content spacing, and bottom navigation.
          </p>
        </div>
      </div>
    </UserLayout>
  ),
};

export const AdminAndOperationalLayouts: Story = {
  render: () => (
    <div className="-m-6">
      <SuperAdminLayout title="Platform Overview" subtitle="Storybook shell preview for admin pages">
        <div className="grid gap-space-6 lg:grid-cols-2">
          <OperationalSection
            title="Manage Restaurants"
            description="Approve, deactivate, or configure restaurant accounts"
            icon={Store}
            href="/admin/restaurants"
            stats={[
              { label: "Active", value: 4, variant: "success" },
              { label: "Inactive", value: 0 },
            ]}
          >
            <Button variant="secondary">Open restaurants</Button>
          </OperationalSection>
          <OperationalSection
            title="View Subscriptions"
            description="Monitor subscriptions and payments"
            icon={CreditCard}
            href="/admin/subscriptions"
            stats={[
              { label: "Active", value: 12, variant: "success" },
              { label: "Pending", value: 2, variant: "warning" },
            ]}
          >
            <Button variant="secondary">Open subscriptions</Button>
          </OperationalSection>
          <OperationalSection
            title="Users"
            description="Watch account growth and platform access"
            icon={Users}
            href="/admin/dashboard"
            stats={[{ label: "Total", value: 48 }]}
          />
        </div>
      </SuperAdminLayout>
    </div>
  ),
};
