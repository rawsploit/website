/* ============================================================
   SITE SETTINGS  —  change the suite name here, nowhere else.
   ============================================================ */
window.SITE = {
  name: "Kalavara",
  tagline: "Stock, sales and accounts for growing factories, in one place.",
  credit: "Designed by rawsploit@gmail.com",
  year: 2026
};

/* Teams (enterprise roles). Admin / Manager sees every module. */
window.TEAMS = [
  { id: "factory",  name: "Factory",          blurb: "Production, stores and stock counts" },
  { id: "sales",    name: "Sales",            blurb: "Field sales, vans and collections" },
  { id: "accounts", name: "Accounts",         blurb: "Reconciliations, collections and P&L" },
  { id: "admin",    name: "Admin / Manager",  blurb: "Everything, plus people and setup" }
];

/* Modules. `teams` = which roles see it (admin always sees all).
   An empty list means Admin / Manager only. */
window.MODULES = [
  { id: "stockbook",   name: "StockBook",        teams: ["factory"],  desc: "Daily stock ledger: receipts, production, transfers, vans and adjustments." },
  { id: "stocktake",   name: "Stock Take",       teams: ["factory"],  desc: "Physical counts against book stock, with reconciliation." },
  { id: "fieldsales",  name: "Field Sales",      teams: ["sales"],    desc: "Daily sales reports from sales staff, with photo upload." },
  { id: "collections", name: "Collections",      teams: ["sales", "accounts"], desc: "Overdue shops and what each salesperson should collect today." },
  { id: "nexus",       name: "Trade Recon",      teams: ["accounts"], desc: "Matches field sales against what was booked in the accounts." },
  { id: "cashrecon",   name: "Cash Recon",       teams: ["accounts"], desc: "Deposit slips against cash collected and the day book." },
  { id: "books",       name: "Accounting-Books", teams: ["accounts"], desc: "Ledgers, GST bills, receipts and payments, with Tally-style keys. Feeds every other module." },
  { id: "pnl",         name: "Profit & Loss",    teams: ["accounts"], desc: "Management P&L built from stock and sales." },
  { id: "payroll",     name: "Payroll",          teams: [],           desc: "Attendance and monthly salaries for field staff." },
  { id: "mis",         name: "MIS Dashboard",    teams: [],           desc: "Receivables, collections, P&L and sales by salesperson, for management." }
];

/* Clients. Each client gets a link like  index.html?c=demo
   `api` = the client's core backend URL (blank = demo mode).
   `modules` = web-app URL for each module that is connected. */
window.CLIENTS = {
  demo: {
    name: "Demo Foods Pvt. Ltd.",
    logo: "",
    theme: "teal",            /* colour theme: "teal", "blue" or "maroon" */
    api: "",
    /* demo: Accounting-Books runs as a self-contained preview (data stays in the browser tab) */
    modules: { books: "demo/accounting-books.html" }
  },
  /* first real test deployment (Kalavara Demo folder, sample data only) */
  test: {
    name: "Kalavara Hygiene",
    logo: "",
    theme: "teal",
    api: "https://script.google.com/macros/s/AKfycbzKTnow9_xb_wGqdjVl7x2S6UQ7ndaW2NNJ9cpsonrNses7gAZY9stDMasQ2v9Bxhk3tg/exec",
    modules: {
      books: "https://script.google.com/macros/s/AKfycbyxVzvFGf2LCfk3Q2UFgBNgHNCWazi0xkcgUjnaanFAyhc99NXbEzTBi2nNiKflVFF0/exec",
      stockbook: "https://script.google.com/macros/s/AKfycby6LhlxzQjwd4nYxTkRFvvPJlO3vrF-TSPeYD7ir4Tm7KgE83b4MNkb5lHX2Yc8pgyDsg/exec",
      stocktake: "https://script.google.com/macros/s/AKfycbwKMdKaaKSiYWWYMdaGvJ5GQH0A-CVH0QqYrv9YH_vqLcc_P_ryqfzJXsmaNp2cl3tJUg/exec",
      fieldsales: "https://script.google.com/macros/s/AKfycbyiZgpx6jdpAppmw0STYaEhwJf2mr69EXwuh7URVANZC2w5ZEy_m_Ev1JglZCxnTTdN/exec",
      collections: "https://script.google.com/macros/s/AKfycbwOtwEuZOkQ6lKlXWNqBvdVyLGkgy5C4yWl2nFTjUwAaxE2lfOPIojjr4whWU1O2DE2/exec"
    }
  }
};
