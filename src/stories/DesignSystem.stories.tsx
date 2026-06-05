import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { AlertCircle, CalendarDays, CreditCard, Search, Settings, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const meta = {
  title: "Design System/Component Catalog",
  parameters: {
    docs: {
      description: {
        component: "Reusable Prospera Sub design-system primitives and their normalized states.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-space-4 rounded-radius-lg bg-card p-space-6">
    <h2 className="text-panel-title">{title}</h2>
    {children}
  </section>
);

export const Buttons: Story = {
  render: () => (
    <Section title="Buttons">
      <div className="flex flex-wrap gap-space-3">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="tertiary">Tertiary</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="link">Link Button</Button>
        <Button loading loadingText="Saving">Save</Button>
      </div>
      <div className="flex flex-wrap gap-space-3">
        <Button size="sm">Small</Button>
        <Button size="lg">Large</Button>
        <Button size="xl">Extra Large</Button>
        <Button size="icon" aria-label="Settings">
          <Settings />
        </Button>
        <Button variant="secondary" size="icon" aria-label="Search">
          <Search />
        </Button>
        <Button variant="tertiary" size="icon" aria-label="Sparkles">
          <Sparkles />
        </Button>
      </div>
    </Section>
  ),
};

export const Inputs: Story = {
  render: () => (
    <Section title="Inputs">
      <div className="grid gap-space-5 md:grid-cols-2">
        <Input label="Name" placeholder="Frorex Studio" helperText="Default input" />
        <Input label="Email" type="email" placeholder="you@example.com" leftIcon={<Search className="h-4 w-4" />} />
        <Input label="Password" type="password" passwordToggle defaultValue="password" />
        <Input label="Error" errorText="This field is required" defaultValue="Wrong value" />
        <Input label="Success" successText="Looks good" defaultValue="Ready" />
        <Input label="Loading" loading defaultValue="Checking..." />
        <Input label="Disabled" disabled placeholder="Disabled" />
        <Input label="Read-only" readOnly defaultValue="Read-only value" />
      </div>
      <Textarea
        label="Notes"
        placeholder="Add service notes..."
        helperText="Textarea with helper text and counter."
        maxLength={180}
        showCount
        defaultValue="Weekly plan notes for operations."
      />
    </Section>
  ),
};

export const ChoiceControls: Story = {
  render: () => (
    <Section title="Select, Checkbox, Radio, Switch">
      <div className="grid gap-space-6 md:grid-cols-2">
        <div className="space-y-space-2">
          <Label>Service location</Label>
          <Select defaultValue="prospera">
            <SelectTrigger>
              <SelectValue placeholder="Choose location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="prospera">Prospera Village</SelectItem>
              <SelectItem value="pristine">Pristine Bay</SelectItem>
              <SelectItem value="duna">Duna Tower</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-space-4">
          <label className="flex items-center gap-space-3">
            <Checkbox defaultChecked />
            <span className="text-body">Send checkout reminders</span>
          </label>
          <label className="flex items-center gap-space-3">
            <Switch defaultChecked />
            <span className="text-body">Notifications enabled</span>
          </label>
        </div>
        <RadioGroup defaultValue="weekly" className="space-y-space-3">
          <label className="flex items-center gap-space-3">
            <RadioGroupItem value="weekly" />
            <span>Weekly</span>
          </label>
          <label className="flex items-center gap-space-3">
            <RadioGroupItem value="monthly" />
            <span>Monthly</span>
          </label>
        </RadioGroup>
        <div className="space-y-space-3">
          <Label>Weekly price range</Label>
          <Slider defaultValue={[68]} min={1} max={120} step={1} />
        </div>
      </div>
    </Section>
  ),
};

export const TabsAndPanels: Story = {
  render: () => (
    <Section title="Tabs and Cards">
      <Tabs defaultValue="overview" variant="pills" className="space-y-space-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Platform Overview</CardTitle>
              <CardDescription>Reusable card surface with title and description.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-space-2">
              <Badge>Active</Badge>
              <Badge variant="secondary">Draft</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="destructive">Issue</Badge>
            </CardContent>
            <CardFooter>
              <Button variant="secondary">Manage</Button>
            </CardFooter>
          </Card>
        </TabsContent>
        <TabsContent value="subscriptions">Subscription panel content.</TabsContent>
        <TabsContent value="payments">Payment panel content.</TabsContent>
      </Tabs>
    </Section>
  ),
};

export const Overlays: Story = {
  render: () => (
    <Section title="Overlays">
      <div className="flex flex-wrap gap-space-3">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary">Open Dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Profile details</DialogTitle>
              <DialogDescription>Dialog keeps form actions focused.</DialogDescription>
            </DialogHeader>
            <Input label="Display name" defaultValue="Frorex Studio" />
          </DialogContent>
        </Dialog>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="secondary">Open Sheet</Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>Sheet panel for filter controls.</SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary">Menu</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>View bookings</DropdownMenuItem>
            <DropdownMenuItem>Open client profile</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">Confirm</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel booking?</AlertDialogTitle>
              <AlertDialogDescription>This shows the destructive confirmation pattern.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep</AlertDialogCancel>
              <AlertDialogAction>Cancel booking</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="tertiary" aria-label="Info">
                <AlertCircle />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Tooltip content</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </Section>
  ),
};

export const DataDisplay: Story = {
  render: function DataDisplayStory() {
    const [date, setDate] = useState<Date | undefined>(new Date(2026, 4, 15));

    return (
      <div className="grid gap-space-6 xl:grid-cols-[360px_1fr]">
        <Section title="Calendar">
          <Calendar mode="single" selected={date} onSelect={setDate} className="rounded-radius-lg border border-border" />
        </Section>
        <Section title="Table and Alert">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Vegetarian Weekly</TableCell>
                <TableCell>Active</TableCell>
                <TableCell className="text-right">$68.00</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Studio Cleaning</TableCell>
                <TableCell>Booked</TableCell>
                <TableCell className="text-right">$79.00</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <Alert className="mt-space-6">
            <CreditCard className="h-4 w-4" />
            <AlertTitle>Lightning ready</AlertTitle>
            <AlertDescription>Use alerts for payment and booking status feedback.</AlertDescription>
          </Alert>
        </Section>
      </div>
    );
  },
};
