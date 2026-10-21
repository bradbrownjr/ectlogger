import React from 'react';
import ICS213PrintView from '../traffic/print/ICS213PrintView';
import ExerciseMarking from '../traffic/print/ExerciseMarking';
import { printPageStyle, gridTableStyle, cellStyle } from '../traffic/print/printStyles';
import { CoverageSite, SITE_TYPE_LABELS, formatSiteLine } from '../../utils/coverageSites';
import {
  DrillEvent, DrillPlan, OBJECTIVE_RATING_LABELS, eventsForSite, groupObjectives, markExerciseText,
} from '../../utils/drillPlan';

// ========== DRILL PLAN PRINT VIEW ==========
// The printed plan, or one site's packet, captured off-screen by
// utils/pdfExport.ts like the traffic print views. Black on white whatever
// the app's theme, and every block is a data-pdf-avoid-break so a table row
// or a form is never cut across two pages.
//
// The whole plan has every row and every prepared message, and a Sites list
// listing the sites the net supports with their addresses, notes and other
// details, for the exercise director. A site's packet has that site's own
// details, its rows and the every-site rows, the messages it sends, and
// blank ICS-213s for the traffic it writes on the day. Only net staff can
// open a plan, so the details print (routers/drill_plans.py).

interface DrillPlanPrintViewProps {
  id: string;
  plan: DrillPlan;
  netName: string;
  sites: CoverageSite[];
  // null = the whole plan.
  siteId: number | null;
  blankForms: number;
  showRatings?: boolean;
}

const headingStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, margin: '14px 0 6px' };
const paragraphStyle: React.CSSProperties = { fontSize: 11, whiteSpace: 'pre-wrap', margin: '0 0 6px' };
const thStyle: React.CSSProperties = { ...cellStyle, fontWeight: 700, backgroundColor: '#e0e0e0', fontSize: 10 };
const tdStyle: React.CSSProperties = { ...cellStyle, fontSize: 10, whiteSpace: 'pre-wrap' };

const Block: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div data-pdf-avoid-break="">{children}</div>
);

// A site's address, coordinates, notes and imported columns.
const SiteDetails: React.FC<{ site: CoverageSite }> = ({ site }) => {
  const rows: [string, string][] = [];
  if (site.address) rows.push(['Address', site.address]);
  if (site.latitude != null && site.longitude != null) rows.push(['Coordinates', `${site.latitude}, ${site.longitude}`]);
  if (site.notes) rows.push(['Notes', site.notes]);
  Object.entries(site.details || {}).forEach(([k, v]) => rows.push([k, v]));
  if (rows.length === 0) return null;
  return (
    <table style={{ fontSize: 10, borderCollapse: 'collapse', marginTop: 2 }}>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td style={{ padding: '1px 10px 1px 0', fontWeight: 700, verticalAlign: 'top', whiteSpace: 'nowrap' }}>{k}</td>
            <td style={{ padding: '1px 0', whiteSpace: 'pre-wrap' }}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const DrillPlanPrintView: React.FC<DrillPlanPrintViewProps> = ({ id, plan, netName, sites, siteId, blankForms, showRatings }) => {
  const siteName = (sid: number | null | undefined) => sites.find((s) => s.id === sid)?.name ?? null;
  const packetSite = siteId == null ? null : sites.find((s) => s.id === siteId) ?? null;
  // The Sites list: the sites the net supports or uses, not an imported
  // list's others.
  const usedSites = sites.filter((s) => s.site_type !== 'infrastructure' && s.in_use);
  const events = eventsForSite(plan.events, siteId);
  const messages: DrillEvent[] = events.filter((e) => e.message && (siteId == null || e.site_id === siteId));
  const incidentName = plan.exercise_name || netName;
  const title = plan.exercise_name || netName;

  return (
    <div id={id} style={{ backgroundColor: '#ffffff', width: 800 }}>
      <div style={printPageStyle}>
        <Block>
          <ExerciseMarking position="top" />
          <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 13, marginTop: 2 }}>
            {siteId == null ? 'Exercise plan' : `Site packet: ${siteName(siteId)}`}
          </div>
          {plan.exercise_when && <div style={{ fontSize: 11, marginTop: 4 }}>{plan.exercise_when}</div>}
          {plan.location && <div style={{ fontSize: 11 }}>{plan.location}</div>}
        </Block>

        {/* Packet only: where this site is and what the EMA's list says about it */}
        {packetSite && (packetSite.location || packetSite.address || packetSite.notes || packetSite.details) && (
          <Block>
            <div style={headingStyle}>Site</div>
            <div style={{ fontSize: 11 }}>{formatSiteLine(packetSite.name, packetSite.location)}</div>
            <SiteDetails site={packetSite} />
          </Block>
        )}

        {plan.purpose && (
          <Block>
            <div style={headingStyle}>Purpose</div>
            <p style={paragraphStyle}>{plan.purpose}</p>
          </Block>
        )}
        {plan.announcement && (
          <Block>
            <div style={headingStyle}>Exercise announcement</div>
            <p style={paragraphStyle}>{plan.announcement}</p>
          </Block>
        )}
        {plan.scenario && (
          <Block>
            <div style={headingStyle}>Scenario</div>
            <p style={paragraphStyle}>{plan.scenario}</p>
          </Block>
        )}

        {plan.objectives.length > 0 && (
          <>
            <Block><div style={headingStyle}>Objectives</div></Block>
            {groupObjectives(plan.objectives).map((group, gi) => (
              <Block key={gi}>
                {group.heading && <div style={{ fontSize: 11, fontWeight: 700, margin: '6px 0 2px' }}>{group.heading}</div>}
                <ol style={{ margin: '0 0 4px', paddingLeft: 24, fontSize: 11 }}>
                  {group.items.map((o, i) => (
                    <li key={i} style={{ marginBottom: 2 }}>
                      {o.text}
                      {showRatings && o.rating && (
                        <div style={{ fontSize: 10, fontStyle: 'italic' }}>
                          {OBJECTIVE_RATING_LABELS[o.rating]}{o.result_note ? `: ${o.result_note}` : ''}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </Block>
            ))}
          </>
        )}

        {events.length > 0 && (
          <>
            <Block><div style={headingStyle}>Schedule of events</div></Block>
            <table style={gridTableStyle}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: '9%' }}>Time</th>
                  <th style={{ ...thStyle, width: '13%' }}>Initiator</th>
                  <th style={{ ...thStyle, width: '13%' }}>Receiver</th>
                  <th style={{ ...thStyle, width: '9%' }}>Type</th>
                  <th style={{ ...thStyle, width: '12%' }}>Method</th>
                  <th style={{ ...thStyle, width: '22%' }}>Event</th>
                  <th style={{ ...thStyle, width: '22%' }}>Expected actions</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={e.id ?? i} data-pdf-avoid-break="">
                    <td style={tdStyle}>{e.time_label}</td>
                    <td style={tdStyle}>{e.initiator}</td>
                    <td style={tdStyle}>{e.receiver}</td>
                    <td style={tdStyle}>{e.event_type}</td>
                    <td style={tdStyle}>{e.method}</td>
                    <td style={tdStyle}>
                      {e.description}
                      {e.message?.subject && <div style={{ fontStyle: 'italic' }}>ICS-213: {e.message.subject}</div>}
                      {siteId == null && e.site_id != null && <div style={{ fontStyle: 'italic' }}>Site: {siteName(e.site_id)}</div>}
                    </td>
                    <td style={tdStyle}>{e.expected_actions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <Block><ExerciseMarking position="bottom" /></Block>
      </div>

      {/* Whole plan only: the Sites section, after the schedule */}
      {siteId == null && usedSites.length > 0 && (
        <div style={{ ...printPageStyle, marginTop: 24 }}>
          <Block>
            <ExerciseMarking position="top" />
            <div style={headingStyle}>Sites</div>
          </Block>
          {usedSites.map((site) => (
            <Block key={site.id}>
              <div style={{ fontSize: 11, fontWeight: 700, marginTop: 8 }}>
                {formatSiteLine(site.name, site.location)}
                <span style={{ fontWeight: 400 }}>
                  {' '}({SITE_TYPE_LABELS[site.site_type]}{site.is_primary ? ', primary' : ''})
                </span>
              </div>
              <SiteDetails site={site} />
            </Block>
          ))}
          <Block><ExerciseMarking position="bottom" /></Block>
        </div>
      )}

      {/* Prepared messages, each on its own form, as the site sends them. */}
      {messages.map((e, i) => (
        <div key={`m-${e.id ?? i}`} data-pdf-avoid-break="" style={{ marginTop: 24 }}>
          <ICS213PrintView
            id={`${id}-message-${e.id ?? i}`}
            form={{
              filed_at: '',
              test_category: 'drill',
              field_values: { ...e.message, incident_name: incidentName, message: markExerciseText(e.message?.message) },
            }}
          />
        </div>
      ))}
      {Array.from({ length: blankForms }, (_, i) => (
        <div key={`b-${i}`} data-pdf-avoid-break="" style={{ marginTop: 24 }}>
          <ICS213PrintView
            id={`${id}-blank-${i}`}
            form={{ filed_at: '', test_category: 'drill', field_values: { incident_name: incidentName } }}
          />
        </div>
      ))}
    </div>
  );
};

export default DrillPlanPrintView;
