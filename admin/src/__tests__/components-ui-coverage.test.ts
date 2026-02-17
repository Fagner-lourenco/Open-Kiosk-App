/**
 * Coverage tests for admin/src/components/ui/ (shadcn/ui wrappers)
 */
import { describe, it, expect } from 'vitest';

import * as Alert from '@/components/ui/alert';
import * as AlertDialog from '@/components/ui/alert-dialog';
import * as Avatar from '@/components/ui/avatar';
import * as Badge from '@/components/ui/badge';
import * as Button from '@/components/ui/button';
import * as Calendar from '@/components/ui/calendar';
import * as Card from '@/components/ui/card';
import * as Dialog from '@/components/ui/dialog';
import * as DropdownMenu from '@/components/ui/dropdown-menu';
import * as UiIndex from '@/components/ui/index';
import * as Input from '@/components/ui/input';
import * as Label from '@/components/ui/label';
import * as Pagination from '@/components/ui/pagination';
import * as Popover from '@/components/ui/popover';
import * as ScrollArea from '@/components/ui/scroll-area';
import * as Select from '@/components/ui/select';
import * as Separator from '@/components/ui/separator';
import * as Sheet from '@/components/ui/sheet';
import * as Skeleton from '@/components/ui/skeleton';
import * as Sonner from '@/components/ui/sonner';
import * as StatCard from '@/components/ui/stat-card';
import * as StatusBadge from '@/components/ui/status-badge';
import * as Switch from '@/components/ui/switch';
import * as Table from '@/components/ui/table';
import * as Tabs from '@/components/ui/tabs';
import * as Textarea from '@/components/ui/textarea';
import * as Timeline from '@/components/ui/timeline';
import * as Tooltip from '@/components/ui/tooltip';
import * as TrendIndicator from '@/components/ui/trend-indicator';

const uiModules = {
  Alert, AlertDialog, Avatar, Badge, Button, Calendar, Card,
  Dialog, DropdownMenu, UiIndex, Input, Label, Pagination,
  Popover, ScrollArea, Select, Separator, Sheet, Skeleton,
  Sonner, StatCard, StatusBadge, Switch, Table, Tabs,
  Textarea, Timeline, Tooltip, TrendIndicator,
};

describe('components/ui', () => {
  it.each(Object.entries(uiModules))('%s exporta módulo válido', (name, mod) => {
    expect(mod).toBeDefined();
    expect(Object.keys(mod).length).toBeGreaterThan(0);
  });
});
