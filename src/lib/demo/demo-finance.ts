import type {
  CompanyFinancials,
  EventFinancialSummary,
  RevenueForecastItem,
} from "@/app/actions/company-financials";

const now = Date.now();
const day = 24 * 60 * 60 * 1000;
const iso = (daysAgo: number) => new Date(now - daysAgo * day).toISOString();

export const DEMO_COMPANY_FINANCIALS: CompanyFinancials = {
  totalRevenue: 12480,
  totalExpenses: 7960,
  netProfit: 4520,
  totalTicketsSold: 487,
  avgRevenuePerEvent: 4160,
  totalEvents: 3,
  profitMargin: 36.2,
};

export const DEMO_EVENT_FIN_SUMMARIES: EventFinancialSummary[] = [
  {
    id: "demo-fin-1",
    eventId: "demo-evt-past-1",
    title: "Nocturnal Sounds: Opening Night",
    date: iso(5),
    ticketsSold: 142,
    grossRevenue: 3480,
    totalExpenses: 2210,
    netRevenue: 3480,
    profit: 1270,
    status: "approved",
    eventStatus: "completed",
    margin: 36.5,
  },
  {
    id: "demo-fin-2",
    eventId: "demo-evt-past-2",
    title: "Warehouse Sessions 001",
    date: iso(21),
    ticketsSold: 168,
    grossRevenue: 4620,
    totalExpenses: 2880,
    netRevenue: 4620,
    profit: 1740,
    status: "paid",
    eventStatus: "completed",
    margin: 37.7,
  },
  {
    id: "demo-fin-3",
    eventId: "demo-evt-past-3",
    title: "Basement Broadcast 004",
    date: iso(45),
    ticketsSold: 177,
    grossRevenue: 4380,
    totalExpenses: 2870,
    netRevenue: 4380,
    profit: 1510,
    status: "paid",
    eventStatus: "completed",
    margin: 34.5,
  },
];

export const DEMO_REVENUE_FORECASTS: RevenueForecastItem[] = [
  {
    id: "demo-evt-upcoming-1",
    title: "Deep Frequencies Vol. 3",
    startsAt: iso(-18),
    publishedAt: iso(7),
    status: "published",
    ticketsSold: 62,
    totalCapacity: 220,
    currentRevenue: 1488,
    projectedRevenue: 4620,
    avgTicketPrice: 24,
    daysUntilEvent: 18,
    daysSincePublish: 7,
    dailySalesVelocity: 8.9,
    projectedTickets: 195,
    capacityUtilization: 28,
    projectedUtilization: 89,
    artistCosts: 850,
    projectedProfit: 2080,
  },
  {
    id: "demo-evt-upcoming-2",
    title: "House of Shadows",
    startsAt: iso(-32),
    publishedAt: iso(3),
    status: "published",
    ticketsSold: 24,
    totalCapacity: 300,
    currentRevenue: 528,
    projectedRevenue: 5280,
    avgTicketPrice: 22,
    daysUntilEvent: 32,
    daysSincePublish: 3,
    dailySalesVelocity: 8.0,
    projectedTickets: 240,
    capacityUtilization: 8,
    projectedUtilization: 80,
    artistCosts: 1100,
    projectedProfit: 2360,
  },
];

export type DemoSettlement = {
  id: string;
  event_id: string;
  status: "draft" | "approved" | "paid";
  total_revenue: number;
  platform_fee: number;
  stripe_fee: number;
  net_payout: number;
  created_at: string;
  events: { title: string; starts_at: string; venue_name: string | null } | null;
};

export const DEMO_SETTLEMENTS: DemoSettlement[] = [
  {
    id: "demo-settle-1",
    event_id: "demo-evt-past-2",
    status: "paid",
    total_revenue: 4620,
    platform_fee: 323,
    stripe_fee: 184,
    net_payout: 1233,
    created_at: iso(18),
    events: {
      title: "Warehouse Sessions 001",
      starts_at: iso(21),
      venue_name: "Nocturne Bar",
    },
  },
  {
    id: "demo-settle-2",
    event_id: "demo-evt-past-3",
    status: "paid",
    total_revenue: 4380,
    platform_fee: 307,
    stripe_fee: 180,
    net_payout: 1023,
    created_at: iso(42),
    events: {
      title: "Basement Broadcast 004",
      starts_at: iso(45),
      venue_name: "The Velvet Underground",
    },
  },
  {
    id: "demo-settle-3",
    event_id: "demo-evt-past-1",
    status: "approved",
    total_revenue: 3480,
    platform_fee: 243,
    stripe_fee: 152,
    net_payout: 875,
    created_at: iso(2),
    events: {
      title: "Nocturnal Sounds: Opening Night",
      starts_at: iso(5),
      venue_name: "CODA",
    },
  },
];
