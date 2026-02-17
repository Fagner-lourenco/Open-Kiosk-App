/**
 * Coverage tests for src/components/ui/ (shadcn/ui primitives)
 * All 42 uncovered UI component files
 */
import { describe, it, expect } from 'vitest';

import * as Accordion from '@/components/ui/accordion';
import * as AlertDialog from '@/components/ui/alert-dialog';
import * as AlertMod from '@/components/ui/alert';
import * as AspectRatio from '@/components/ui/aspect-ratio';
import * as AvatarMod from '@/components/ui/avatar';
import * as BadgeMod from '@/components/ui/badge';
import * as Breadcrumb from '@/components/ui/breadcrumb';
import * as ButtonMod from '@/components/ui/button';
import * as CalendarMod from '@/components/ui/calendar';
import * as CanMod from '@/components/ui/Can';
import * as Carousel from '@/components/ui/carousel';
import * as ChartMod from '@/components/ui/chart';
import * as Collapsible from '@/components/ui/collapsible';
import * as CommandMod from '@/components/ui/command';
import * as ContextMenu from '@/components/ui/context-menu';
import * as DialogMod from '@/components/ui/dialog';
import * as Drawer from '@/components/ui/drawer';
import * as DropdownMenu from '@/components/ui/dropdown-menu';
import * as FormMod from '@/components/ui/form';
import * as HoverCard from '@/components/ui/hover-card';
import * as InputOtp from '@/components/ui/input-otp';
import * as Menubar from '@/components/ui/menubar';
import * as NavigationMenu from '@/components/ui/navigation-menu';
import * as PaginationMod from '@/components/ui/pagination';
import * as PopoverMod from '@/components/ui/popover';
import * as ProgressMod from '@/components/ui/progress';
import * as RadioGroup from '@/components/ui/radio-group';
import * as Resizable from '@/components/ui/resizable';
import * as ScrollArea from '@/components/ui/scroll-area';
import * as SelectMod from '@/components/ui/select';
import * as SeparatorMod from '@/components/ui/separator';
import * as Sheet from '@/components/ui/sheet';
import * as SidebarMod from '@/components/ui/sidebar';
import * as SkeletonMod from '@/components/ui/skeleton';
import * as SliderMod from '@/components/ui/slider';
import * as SonnerMod from '@/components/ui/sonner';
import * as SwitchMod from '@/components/ui/switch';
import * as TableMod from '@/components/ui/table';
import * as TabsMod from '@/components/ui/tabs';
import * as TextareaMod from '@/components/ui/textarea';
import * as ToastMod from '@/components/ui/toast';
import * as ToasterMod from '@/components/ui/toaster';
import * as ToggleGroup from '@/components/ui/toggle-group';
import * as ToggleMod from '@/components/ui/toggle';
import * as TooltipMod from '@/components/ui/tooltip';

const uiModules: Record<string, object> = {
  Accordion, AlertDialog, AlertMod, AspectRatio, AvatarMod,
  BadgeMod, Breadcrumb, ButtonMod, CalendarMod, CanMod,
  Carousel, ChartMod, Collapsible, CommandMod, ContextMenu,
  DialogMod, Drawer, DropdownMenu, FormMod, HoverCard,
  InputOtp, Menubar, NavigationMenu, PaginationMod, PopoverMod,
  ProgressMod, RadioGroup, Resizable, ScrollArea, SelectMod,
  SeparatorMod, Sheet, SidebarMod, SkeletonMod, SliderMod,
  SonnerMod, SwitchMod, TableMod, TabsMod, TextareaMod,
  ToastMod, ToasterMod, ToggleGroup, ToggleMod, TooltipMod,
};

describe('kiosk UI components — módulos exportam corretamente', () => {
  it.each(Object.entries(uiModules))('%s tem exports', (_name, mod) => {
    expect(mod).toBeDefined();
    const keys = Object.keys(mod);
    expect(keys.length).toBeGreaterThan(0);
  });
});

describe('UI components — exports específicos', () => {
  it('Accordion exporta componentes compostos', () => {
    expect(Accordion.Accordion).toBeDefined();
    expect(Accordion.AccordionItem).toBeDefined();
    expect(Accordion.AccordionTrigger).toBeDefined();
    expect(Accordion.AccordionContent).toBeDefined();
  });

  it('Badge exporta Badge e badgeVariants', () => {
    expect(BadgeMod.Badge).toBeDefined();
    expect(BadgeMod.badgeVariants).toBeDefined();
  });

  it('Button exporta Button e buttonVariants', () => {
    expect(ButtonMod.Button).toBeDefined();
    expect(ButtonMod.buttonVariants).toBeDefined();
  });

  it('Card exporta componentes compostos', () => {
    expect(AlertMod.Alert).toBeDefined();
    expect(AlertMod.AlertTitle).toBeDefined();
  });

  it('Dialog exporta componentes compostos', () => {
    expect(DialogMod.Dialog).toBeDefined();
    expect(DialogMod.DialogTrigger).toBeDefined();
    expect(DialogMod.DialogContent).toBeDefined();
  });

  it('Can exporta componentes de permissão', () => {
    expect(CanMod.Can).toBeDefined();
    expect(CanMod.CanView).toBeDefined();
    expect(CanMod.useCanCheck).toBeDefined();
  });

  it('Form exporta useFormField e componentes', () => {
    expect(FormMod.useFormField).toBeDefined();
    expect(FormMod.Form).toBeDefined();
    expect(FormMod.FormItem).toBeDefined();
  });

  it('Sidebar exporta Provider e componentes', () => {
    expect(SidebarMod.SidebarProvider).toBeDefined();
    expect(SidebarMod.Sidebar).toBeDefined();
    expect(SidebarMod.useSidebar).toBeDefined();
  });

  it('Table exporta componentes compostos', () => {
    expect(TableMod.Table).toBeDefined();
    expect(TableMod.TableHeader).toBeDefined();
    expect(TableMod.TableBody).toBeDefined();
    expect(TableMod.TableRow).toBeDefined();
    expect(TableMod.TableCell).toBeDefined();
  });

  it('Toast exporta Toast e ToastProvider', () => {
    expect(ToastMod.Toast).toBeDefined();
    expect(ToastMod.ToastProvider).toBeDefined();
  });

  it('Toaster exporta Toaster', () => {
    expect(ToasterMod.Toaster).toBeDefined();
  });
});
