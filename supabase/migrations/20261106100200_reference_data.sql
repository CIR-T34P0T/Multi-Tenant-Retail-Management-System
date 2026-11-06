-- =============================================================================
-- Stage 3 · Migration 3 of 5 — Reference data
--
-- Modules, permission catalogue and default role templates.
-- These are platform-wide (no business_id) and read-only for users.
--
-- Keep `modules` in sync with src/modules/registry.ts and `permissions` in sync
-- with src/lib/authz/permissions.ts — unit tests compare them.
-- =============================================================================

insert into public.modules (code, name, is_core, requires, sort_order) values
  ('core',       'Business & users',      true,  '{}',                    10),
  ('catalog',    'Sections & catalogue',  true,  '{core}',                20),
  ('pricing',    'Pricing',               true,  '{catalog}',             30),
  ('inventory',  'Inventory',             true,  '{catalog}',             40),
  ('dashboard',  'Dashboard',             true,  '{inventory}',           50),
  ('sales',      'Sales',                 false, '{pricing,inventory}',   60),
  ('purchases',  'Purchases',             false, '{inventory}',           70),
  ('suppliers',  'Suppliers',             false, '{core}',                80),
  ('customers',  'Customers',             false, '{core}',                90),
  ('credit',     'Credit',                false, '{sales,customers}',    100),
  ('expenses',   'Expenses',              false, '{core}',               110),
  ('accounting', 'Accounting',            false, '{core}',               120),
  ('analytics',  'Advanced analytics',    false, '{dashboard}',          130);

insert into public.permissions (code, module_code, description, is_sensitive) values
  -- Business & users
  ('core.business.update',      'core',      'Edit business details',                                   true),
  ('core.settings.manage',      'core',      'Change business settings',                                true),
  ('core.module.manage',        'core',      'Turn optional modules on or off',                         true),
  ('core.member.view',          'core',      'See the staff list',                                      false),
  ('core.member.manage',        'core',      'Invite, suspend and change roles of staff',               true),
  ('core.role.manage',          'core',      'Create and edit roles and their permissions',             true),
  ('core.audit.view',           'core',      'View the audit log',                                      false),
  ('core.data.export',          'core',      'Export business data',                                    true),
  -- Sections & catalogue
  ('catalog.product.view',      'catalog',   'View sections, categories and products',                  false),
  ('catalog.product.manage',    'catalog',   'Create and edit products and variants',                   false),
  ('catalog.section.manage',    'catalog',   'Create and edit sections and categories',                 false),
  -- Pricing
  ('pricing.price.view',        'pricing',   'View selling prices and price history',                   false),
  ('pricing.price.update',      'pricing',   'Change selling prices',                                   true),
  -- Inventory
  ('inventory.stock.view',      'inventory', 'View stock levels and movement history',                  false),
  ('inventory.cost.view',       'inventory', 'See cost prices, stock value and margins',                true),
  ('inventory.stock.adjust',    'inventory', 'Add or deduct stock manually',                            true),
  ('inventory.adjustment.approve','inventory','Approve large stock adjustments',                        true),
  ('inventory.writeoff.record', 'inventory', 'Record damaged, expired or missing stock',                 true),
  ('inventory.count.perform',   'inventory', 'Enter stock count quantities',                            false),
  ('inventory.count.post',      'inventory', 'Review and post stock counts',                            true),
  -- Dashboard & core reports
  ('dashboard.overview.view',   'dashboard', 'View the dashboard',                                      false),
  ('dashboard.report.view',     'dashboard', 'View inventory reports',                                  false),
  ('dashboard.report.export',   'dashboard', 'Export reports',                                          false),
  -- Sales
  ('sales.pos.use',             'sales',     'Use the point of sale',                                   false),
  ('sales.sale.view_own',       'sales',     'View own sales',                                          false),
  ('sales.sale.view_all',       'sales',     'View all sales',                                          false),
  ('sales.discount.apply',      'sales',     'Give discounts within the allowed limit',                 true),
  ('sales.price.override',      'sales',     'Change a price at the till',                              true),
  ('sales.sale.cancel',         'sales',     'Cancel a completed sale (same day)',                      true),
  ('sales.return.process',      'sales',     'Process customer returns and refunds',                    true),
  ('sales.cash.manage',         'sales',     'Close and reconcile any cash session',                    true),
  ('sales.report.view',         'sales',     'View sales reports',                                      false),
  -- Purchases & suppliers
  ('purchases.purchase.manage', 'purchases', 'Create and edit purchases',                               false),
  ('purchases.purchase.receive','purchases', 'Receive goods into stock',                                false),
  ('suppliers.supplier.view',   'suppliers', 'View suppliers',                                          false),
  ('suppliers.supplier.manage', 'suppliers', 'Create and edit suppliers',                               false),
  -- Customers & credit
  ('customers.customer.view',   'customers', 'View customers',                                          false),
  ('customers.customer.manage', 'customers', 'Create and edit customers',                               false),
  ('customers.customer.erase',  'customers', 'Anonymise a customer on request',                         true),
  ('credit.sale.on_credit',     'credit',    'Sell on credit',                                          true),
  ('credit.payment.record',     'credit',    'Record customer repayments',                              false),
  ('credit.balance.view',       'credit',    'View customer balances',                                  false),
  -- Expenses & accounting
  ('expenses.expense.record',   'expenses',  'Record expenses',                                         false),
  ('expenses.expense.approve',  'expenses',  'Approve expenses',                                        true),
  ('expenses.report.view',      'expenses',  'View expense reports',                                    false),
  ('accounting.ledger.view',    'accounting','View accounting reports and ledgers',                     false),
  ('accounting.ledger.manage',  'accounting','Manage accounts, journals and periods',                   true),
  -- Analytics
  ('analytics.report.view',     'analytics', 'View advanced analytics',                                 false);

insert into public.role_templates (key, name, description, is_owner, sort_order) values
  ('owner',     'Owner',     'Full control of the business. Has every permission.',                              true,  10),
  ('manager',   'Manager',   'Runs the shop day to day. Cannot change modules or roles, or cancel sales.',        false, 20),
  ('attendant', 'Attendant', 'Sells, receives and counts stock. No cost prices, no price changes, no cancellations.', false, 30);

-- The owner role needs no rows: it implicitly has every permission.

-- Manager: everything except owner-only controls.
insert into public.role_template_permissions (template_key, permission_code)
select 'manager', code
from public.permissions
where code not in (
  'core.business.update',
  'core.module.manage',
  'core.role.manage',
  'core.data.export',
  'customers.customer.erase',
  'sales.sale.cancel',          -- owner-only, same day (docs/12 Q3)
  'accounting.ledger.manage'
);

-- Attendant: day-to-day selling and stock handling (docs/12 §5 #10).
insert into public.role_template_permissions (template_key, permission_code) values
  ('attendant', 'dashboard.overview.view'),
  ('attendant', 'catalog.product.view'),
  ('attendant', 'pricing.price.view'),
  ('attendant', 'inventory.stock.view'),
  ('attendant', 'inventory.count.perform'),
  ('attendant', 'sales.pos.use'),
  ('attendant', 'sales.sale.view_own'),
  ('attendant', 'purchases.purchase.receive'),
  ('attendant', 'suppliers.supplier.view'),
  ('attendant', 'customers.customer.view'),
  ('attendant', 'customers.customer.manage');
