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
  { id: "accounts", name: "Accounts",         blurb: "Reconciliations, receivables and P&L" },
  { id: "admin",    name: "Admin / Manager",  blurb: "Everything, plus people and setup" }
];

/* Modules. `teams` = which roles see it (admin always sees all). */
window.MODULES = [
  { id: "stockbook",   name: "StockBook",        teams: ["factory"],  desc: "Daily stock ledger: receipts, production, transfers, vans and adjustments." },
  { id: "stocktake",   name: "Stock Take",       teams: ["factory"],  desc: "Physical counts against book stock, with reconciliation." },
  { id: "fieldsales",  name: "Field Sales",      teams: ["sales"],    desc: "Daily sales reports from sales staff, with photo upload." },
  { id: "collections", name: "Collections",      teams: ["sales", "accounts"], desc: "Overdue shops and what each salesperson should collect today." },
  { id: "receivables", name: "Receivables",      teams: ["accounts"], desc: "Who owes what, ageing and trends, in one dashboard." },
  { id: "nexus",       name: "Sales Recon",      teams: ["accounts"], desc: "Matches field sales against what was booked in the accounts." },
  { id: "cashrecon",   name: "Cash Recon",       teams: ["accounts"], desc: "Deposit slips against cash collected and the day book." },
  { id: "pnl",         name: "Profit & Loss",    teams: ["accounts"], desc: "Management P&L built from stock and sales." },
  { id: "payroll",     name: "Payroll",          teams: [],           desc: "Attendance and monthly salaries for field staff." }
];

/* Clients. Each client gets a link like  index.html?c=demo
   `api` = the client's core backend URL (blank = demo mode).
   `modules` = web-app URL for each module that is connected. */
window.CLIENTS = {
  demo: {
    name: "Demo Foods Pvt. Ltd.",
    logo: "",
    api: "",
    modules: {}
  }
};
