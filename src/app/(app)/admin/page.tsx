import RoleGate from "@/components/RoleGate";
import PageHeader from "@/components/PageHeader";
import ConfigConsole from "@/components/ConfigConsole";
import StatusPill from "@/components/StatusPill";
import { getDashboardState } from "@/lib/engine/state";
import { CONTRACTS } from "@/lib/integrations/contracts";
import { COST } from "@/lib/engine/network";
import {
  DEMO_PASSWORD,
  OFFICER_ACCOUNTS,
  PUBLIC_ROUTES,
  ROLE_HOME,
  ROLE_LABEL,
  ROLE_ROUTES,
  WORKER_ACCOUNTS,
  type AppRole,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

const ROLES: AppRole[] = ["DRM", "CONTROL", "STATION_MASTER", "INSPECTOR", "KARMI"];
const MODULE_ROWS = ["/command", "/network", "/planner", "/superblocks", "/compare", "/simulation", "/replan", "/defects", "/jobs", "/field", "/station", "/safety", "/audit", "/admin"];

/**
 * USERS, ROLES & CONFIGURATION
 *
 * Renders the real RBAC contract (`ROLE_ROUTES` / `ROLE_HOME` / `PUBLIC_ROUTES`)
 * and the pre-authorised evaluation accounts declared in `src/lib/auth.ts`, plus
 * the live operating-policy switches and the documented data-exchange contracts.
 */
export default async function AdminPage() {
  const state = await getDashboardState();

  return (
    <RoleGate title="Users, Roles &amp; Configuration">
      <div className="space-y-3">
        <PageHeader
          module="ADM-CFG"
          title="Users, Roles & Configuration"
          titleKey="page.admin"
          subtitleKey="page.admin.sub"
          subtitle="Desk accounts, the role-to-module access matrix enforced by the route gate, operating policy switches and the documented data-exchange contracts."
          crumbs={[{ label: "Administration" }, { label: "Users & Ambience Configuration" }]}
          state={state.settings.fogMode || state.settings.vipAlert ? "Restrictions active" : "Nominal operations"}
          stateTone={state.settings.fogMode || state.settings.vipAlert ? "warning" : "success"}
          reference={`${OFFICER_ACCOUNTS.length} officer · ${WORKER_ACCOUNTS.length} field accounts`}
        />

        <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Officer accounts", value: OFFICER_ACCOUNTS.length, sub: "User ID + password" },
            { label: "Field accounts", value: WORKER_ACCOUNTS.length, sub: "mobile + date of birth" },
            { label: "Desk roles", value: ROLES.length, sub: "role derived from account" },
            { label: "Gated modules", value: MODULE_ROWS.length, sub: "route allow-list" },
            { label: "Public surfaces", value: PUBLIC_ROUTES.length, sub: "no sign-in required" },
          ].map((k) => (
            <div key={k.label} className="panel px-3 py-2.5">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">{k.label}</p>
              <p className="mt-1 font-mono text-xl font-bold leading-none text-ink">{k.value}</p>
              <p className="mt-1 text-[10.5px] text-dim">{k.sub}</p>
            </div>
          ))}
        </section>

        {/* Accounts */}
        <section className="panel">
          <div className="panel-hd">
            <span>Pre-authorised evaluation accounts</span>
            <StatusPill label="Prototype credentials" tone="warning" />
          </div>
          <div className="gov-table-wrap">
            <table className="gov-table">
              <thead>
                <tr>
                  <th className="sr">Sr</th>
                  <th>Sign-in ID</th>
                  <th>Name</th>
                  <th>Desk role</th>
                  <th>Designation</th>
                  <th>Unit / gang</th>
                  <th>Door</th>
                  <th>Home module</th>
                </tr>
              </thead>
              <tbody>
                {OFFICER_ACCOUNTS.map((a, i) => (
                  <tr key={a.userId}>
                    <td className="sr">{String(i + 1).padStart(2, "0")}</td>
                    <td className="ref">{a.userId}</td>
                    <td className="text-[11.5px] font-medium text-ink">{a.name}</td>
                    <td>
                      <StatusPill label={ROLE_LABEL[a.role]} tone={a.role === "DRM" ? "critical" : "info"} />
                    </td>
                    <td className="text-[11px] text-dim">{a.designation}</td>
                    <td className="text-[11px] text-dim">{a.unit}</td>
                    <td className="text-[10.5px] text-dim">User ID + password</td>
                    <td className="font-mono text-[10.5px] text-dim">{ROLE_HOME[a.role]}</td>
                  </tr>
                ))}
                {WORKER_ACCOUNTS.map((a, i) => (
                  <tr key={a.mobile}>
                    <td className="sr">{String(OFFICER_ACCOUNTS.length + i + 1).padStart(2, "0")}</td>
                    <td className="ref">{a.mobile}</td>
                    <td className="text-[11.5px] font-medium text-ink">{a.name}</td>
                    <td>
                      <StatusPill label={`${ROLE_LABEL[a.role]} · ${a.department}`} tone="ai" />
                    </td>
                    <td className="text-[11px] text-dim">{a.designation}</td>
                    <td className="text-[11px] text-dim">{a.gang}</td>
                    <td className="text-[10.5px] text-dim">Mobile + DOB</td>
                    <td className="font-mono text-[10.5px] text-dim">{ROLE_HOME[a.role]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-edge px-3 py-2 text-[10.5px] leading-relaxed text-faint">
            Evaluation build: officer password is <span className="font-mono text-dim">{DEMO_PASSWORD}</span> and field sign-in uses the registered mobile
            with the holder&apos;s date of birth. Roles are derived from the account — a user cannot choose their own desk. Production replaces this with
            divisional IAM / LDAP and a signed server session.
          </p>
        </section>

        {/* Access matrix */}
        <section className="panel">
          <div className="panel-hd">
            <span>Role → module access matrix</span>
            <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">enforced by RoleGate · src/lib/auth.ts</span>
          </div>
          <div className="gov-table-wrap">
            <table className="gov-table">
              <thead>
                <tr>
                  <th>Module</th>
                  {ROLES.map((r) => (
                    <th key={r} className="text-center">
                      {ROLE_LABEL[r]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MODULE_ROWS.map((route) => (
                  <tr key={route}>
                    <td className="ref">{route}</td>
                    {ROLES.map((r) => {
                      const allowed = ROLE_ROUTES[r].some((x) => route === x || route.startsWith(`${x}/`));
                      return (
                        <td key={r} className="text-center">
                          {allowed ? (
                            <span className="font-bold text-mint" title="permitted">
                              ●
                            </span>
                          ) : (
                            <span className="text-faint" title="not permitted">
                              ○
                            </span>
                          )}
                          <span className="sr-only">{allowed ? "permitted" : "not permitted"}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="bg-abyss/50">
                  <td className="ref">public: {PUBLIC_ROUTES.join(", ")}</td>
                  {ROLES.map((r) => (
                    <td key={r} className="text-center font-bold text-mint">
                      ●<span className="sr-only">permitted</span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="border-t border-edge px-3 py-2 text-[10.5px] leading-relaxed text-faint">
            ● permitted · ○ refused with an explicit access screen. The same matrix is the allow-list used by the navigation, so no desk is ever offered
            that the gate would refuse.
          </p>
        </section>

        <ConfigConsole
          initial={{ fogMode: state.settings.fogMode, vipAlert: state.settings.vipAlert, dtpRedZone: state.settings.dtpRedZone }}
          systems={CONTRACTS.map((c) => ({
            system: c.system,
            domain: c.domain,
            endpoint: c.endpoint,
            method: c.method,
            contractVersion: c.contractVersion,
            frequencySec: c.frequencySec,
          }))}
        />

        {/* Cost model */}
        <section className="panel">
          <div className="panel-hd">
            <span>Planning cost model in force</span>
            <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">src/lib/engine/network.ts</span>
          </div>
          <div className="gov-table-wrap">
            <table className="gov-table">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th className="num">Rate</th>
                  <th>Applied in</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Passenger delay", COST.paxDelayPerMin, "Optimiser delay-cost objective · what-if lab · block resize"],
                  ["Freight hold", COST.freightHoldPerMin, "Optimiser · what-if lab (rake held per minute)"],
                  ["Diesel idle", COST.dieselIdlePerMin, "Delay-cost objective (locomotives idling under block)"],
                  ["Emergency block", COST.emergencyBlockPerMin, "Failure-exposure avoided (emergency possession)"],
                  ["Planned block", COST.plannedBlockPerMin, "Planned occupancy cost baseline"],
                ].map(([label, rate, applied]) => (
                  <tr key={String(label)}>
                    <td className="text-[11.5px] font-medium text-ink">{label}</td>
                    <td className="num">₹ {Number(rate).toLocaleString("en-IN")} / min</td>
                    <td className="text-[11px] text-dim">{applied}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-edge px-3 py-2 text-[10.5px] leading-relaxed text-faint">
            Rates are engineering assumptions held in configuration — not published tariff figures. They are exposed here so every economic claim in the
            platform can be traced to its input.
          </p>
        </section>
      </div>
    </RoleGate>
  );
}
