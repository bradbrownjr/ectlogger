import React from 'react';
import ICS213PrintView from '../traffic/print/ICS213PrintView';
import ExerciseMarking from '../traffic/print/ExerciseMarking';
import { printPageStyle, gridTableStyle, cellStyle } from '../traffic/print/printStyles';
import { CoverageSite } from '../../utils/coverageSites';
import {
  DrillEvent, DrillPlan, OBJECTIVE_RATING_LABELS, eventsForSite, groupObjectives, markExerciseText,
} from '../../utils/drillPlan';

// ========== DRILL PLAN PRINT VIEW ==========
// The printed plan, or one site's packet, captured off-screen by
// utils/pdfExport.ts like the traffic print views. Black on white whatever
// the app's theme, and every block is a data-pdf-avoid-break so a table row
// or a form is never cut across two pages.
//
// The whole plan has every row and every prepared message. A site's packet
// has that site's rows and the every-site rows, the messages it sends, and
// blank ICS-213s for the traffic it writes on the day.

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

const DrillPlanPrintView: React.FC<DrillPlanPrintViewProps> = ({ id, plan, netName, sites, siteId, blankForms, showRatings }) => {
  const siteName = (sid: number | null | undefined) => sites.find((s) => s.id === sid)?.name ?? null;
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
