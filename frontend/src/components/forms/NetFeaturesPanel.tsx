import React, { useEffect } from 'react';
import {
  Autocomplete,
  Box,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import FoldingFormSection from './FoldingFormSection';
import DistributionListField from './DistributionListField';
import { StripSettings, TrafficHandlingSettings, TrafficSettingsFields } from './TrafficSettingsPanel';
import { useFormDefinitions } from '../../hooks/useFormDefinitions';
import {
  FeatureSectionExpansion,
  FeatureSectionId,
  featureSectionChips,
  featureSectionOptionCounts,
  initialFeatureSectionExpansion,
} from '../../utils/netFeatureSections';

// ========== SHARED NET FEATURES PANEL ==========
// The feature switches on the Basic Info tab of both the net form
// (create-net/BasicInfoTab.tsx) and the schedule form
// (create-schedule/BasicInfoTab.tsx). Until 2026-11-14 each tab carried its
// own copy and the two had drifted (different captions, the net form had no
// General heading, and the traffic settings sat under ARES). Settings only
// one form has come in as props: the net's lobby/chat/auto-close switches
// (generalExtra), its Sites editor (sites), and its Drill plan link
// (aresExtra). The schedule keeps those timing settings on its Schedule tab.
//
// Sections, in order:
//   General Net Features    always shown, includes Assisted Traffic Handling
//   Community Net Features  folds (Topic of the Week, Participant Poll)
//   ARES & EmComm Features  folds (ICS-309, coverage logging, sites, ...)
//   SKYWARN Features        folds (RRI / weather strip fields)
// A folding section starts open when one of its options is on; see
// utils/netFeatureSections.ts.

// Field names match both form contexts (CreateNetContext / CreateScheduleContext),
// so a tab passes its whole context value as `fields`.
export interface NetFeatureFields extends TrafficSettingsFields {
  mobilePrioritySort: boolean; setMobilePrioritySort: (v: boolean) => void;
  selfCheckinEnabled: boolean; setSelfCheckinEnabled: (v: boolean) => void;
  participantsOnly: boolean; setParticipantsOnly: (v: boolean) => void;
  distributionList: string; setDistributionList: (v: string) => void;
  topicOfWeekEnabled: boolean; setTopicOfWeekEnabled: (v: boolean) => void;
  topicOfWeekPrompt: string; setTopicOfWeekPrompt: (v: string) => void;
  pollEnabled: boolean; setPollEnabled: (v: boolean) => void;
  pollQuestion: string; setPollQuestion: (v: string) => void;
  ics309Enabled: boolean; setIcs309Enabled: (v: boolean) => void;
  ics309HideMutedStations: boolean; setIcs309HideMutedStations: (v: boolean) => void;
  propagationLoggingEnabled: boolean; setPropagationLoggingEnabled: (v: boolean) => void;
  selfCanHearEnabled: boolean; setSelfCanHearEnabled: (v: boolean) => void;
  authenticated: boolean; setAuthenticated: (v: boolean) => void;
}

// Which folding sections are open. Held by the page (not this panel), because
// the Basic Info tab unmounts when another tab is shown, and coming back must
// not re-fold a section the user opened. `expanded` stays null until the
// page's data has loaded (`loaded`), then is decided once.
export interface FeatureSectionsState {
  loaded: boolean;
  expanded: FeatureSectionExpansion | null;
  setExpanded: React.Dispatch<React.SetStateAction<FeatureSectionExpansion | null>>;
}

const ALL_FOLDED: FeatureSectionExpansion = { community: false, ares: false, skywarn: false };

// Copy that differs by form. The topic and poll inputs differ too: the
// schedule sets the default question every new net starts with, the net sets
// its own (with the schedule's earlier topics offered).
const COPY = {
  schedule: {
    general: 'Check-in and traffic settings for any net.',
    topic: 'Adds a topic response field to check-ins, for icebreaker questions.',
    poll: 'Adds a poll question to check-ins with auto-complete for consistent answers.',
  },
  net: {
    general: 'Check-in, chat, lobby, and traffic settings for any net.',
    topic: 'Ask participants a question during check-in. Responses are collected and can be exported for club newsletters or blogs.',
    poll: 'Run a quick poll during the net. Answers autocomplete so they stay consistent, and results are shown as a chart.',
  },
};

// ---- One switch with its explanation line ----
// The label is a direct child of the Box so the docs screenshots can clip to
// `div:has(> label:has-text(...))`, caption included.
interface FeatureSwitchProps {
  label: string;
  caption: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  // Settings that show under the switch (a select, a question, a sub-switch)
  children?: React.ReactNode;
}

export const FeatureSwitch: React.FC<FeatureSwitchProps> = ({ label, caption, checked, onChange, children }) => (
  <Box sx={{ mt: 2 }}>
    <FormControlLabel
      control={<Switch checked={checked} onChange={(e) => onChange(e.target.checked)} />}
      label={label}
    />
    <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 4.5, mb: children ? 1 : 0 }}>
      {caption}
    </Typography>
    {children}
  </Box>
);

interface NetFeaturesPanelProps {
  scope: 'net' | 'schedule';
  fields: NetFeatureFields;
  sections: FeatureSectionsState;
  // Net only: earlier topics from the net's schedule, offered in the topic box
  topicHistory?: string[];
  // Net only: the lobby, chat and auto-close switches, after the shared three
  generalExtra?: React.ReactNode;
  // Net only: the Sites editor, and how many sites it holds (for the chip)
  sites?: { count: number; editor: React.ReactNode };
  // Net only (edit mode): the Drill plan link, last in ARES
  aresExtra?: React.ReactNode;
}

const NetFeaturesPanel: React.FC<NetFeaturesPanelProps> = ({
  scope,
  fields,
  sections,
  topicHistory = [],
  generalExtra,
  sites,
  aresExtra,
}) => {
  // One definitions load for both traffic halves, so a strip type defined in
  // SKYWARN shows up in the traffic list at once.
  const formDefinitions = useFormDefinitions();
  const copy = COPY[scope];

  const sectionValues = { ...fields, siteCount: sites?.count };
  const chips = featureSectionChips(sectionValues);
  const optionCounts = featureSectionOptionCounts(scope);

  // ---- Decide which sections start open, once, after the data has loaded ----
  // Never re-run after that, so switching the last option off doesn't fold
  // the section out from under the user.
  const { loaded, expanded, setExpanded } = sections;
  useEffect(() => {
    if (loaded && expanded === null) setExpanded(initialFeatureSectionExpansion(sectionValues));
    // Only the load matters; sectionValues are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, expanded]);

  const open = expanded ?? ALL_FOLDED;
  const setOpen = (id: FeatureSectionId) => (isOpen: boolean) =>
    setExpanded((prev) => ({ ...(prev ?? ALL_FOLDED), [id]: isOpen }));

  return (
    <>
      {/* ========== General Net Features (always shown) ========== */}
      <Typography variant="subtitle1" sx={{ mt: 3, mb: 0.5, fontWeight: 'bold' }}>
        General Net Features
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block">
        {copy.general}
      </Typography>

      <FeatureSwitch
        label="Prioritize mobile stations in check-in list"
        caption="Mobile stations appear at the top of the check-in list (after NCS) so they can be called before they move out of range. Disable for strict chronological order."
        checked={fields.mobilePrioritySort}
        onChange={fields.setMobilePrioritySort}
      />
      <FeatureSwitch
        label="Allow self check-in"
        caption="When disabled, stations can't check themselves in from the app; only Net Control and logging staff can add check-ins. Use this if self check-in causes confusion alongside voice roll call."
        checked={fields.selfCheckinEnabled}
        onChange={fields.setSelfCheckinEnabled}
      />
      {/* Participants only: a label, not a gate (models.Net.participants_only) */}
      <FeatureSwitch
        label="Participants only"
        caption="For the stations taking part in an event or incident, such as a drill's deployed teams. Self check-in can stay open. The net shows a red Participants only label, and the check-in form tells stations it is for those taking part. Net control can remove and block anyone else."
        checked={fields.participantsOnly}
        onChange={fields.setParticipantsOnly}
      />

      {/* One group address for the reminder and the log (models.Net.distribution_list) */}
      <DistributionListField
        scope={scope}
        value={fields.distributionList}
        onChange={fields.setDistributionList}
      />

      {/* Net form only: chat grace, lobby and auto-close */}
      {generalExtra}

      {/* Assisted Traffic Handling: the switch and the form types it takes */}
      <TrafficHandlingSettings fields={fields} formDefinitions={formDefinitions} scope={scope} />

      {/* ========== Community Net Features (folds) ========== */}
      <Box sx={{ mt: 3 }}>
        <FoldingFormSection
          id="community-features"
          title="Community Net Features"
          caption="Optional features for informal community nets."
          optionCount={optionCounts.community}
          chips={chips.community}
          expanded={open.community}
          onExpandedChange={setOpen('community')}
        >
          <FeatureSwitch
            label="Topic of the Week"
            caption={copy.topic}
            checked={fields.topicOfWeekEnabled}
            onChange={fields.setTopicOfWeekEnabled}
          >
            {/* Shows when Topic of the Week is on. A net picks its own
                question (earlier ones offered); a schedule sets the default. */}
            {fields.topicOfWeekEnabled && (scope === 'net' ? (
              <Autocomplete
                freeSolo
                options={topicHistory}
                value={fields.topicOfWeekPrompt}
                onChange={(_, newValue) => fields.setTopicOfWeekPrompt(newValue || '')}
                onInputChange={(_, newInputValue) => fields.setTopicOfWeekPrompt(newInputValue)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Topic Question" margin="normal"
                    placeholder="e.g., What's your favorite radio or antenna?"
                    helperText={topicHistory.length > 0 ? 'Select from prior topics or enter a new one' : 'The question to ask participants during check-in'}
                  />
                )}
                sx={{ ml: 4.5, width: 'calc(100% - 36px)' }}
              />
            ) : (
              <TextField
                fullWidth
                label="Default Topic Prompt"
                value={fields.topicOfWeekPrompt}
                onChange={(e) => fields.setTopicOfWeekPrompt(e.target.value)}
                placeholder="e.g., What's your favorite radio memory?"
                helperText="Every new net starts with this question. Leave it blank to set each net's topic in Topics."
                sx={{ mt: 1, ml: 4.5, width: 'calc(100% - 36px)' }}
              />
            ))}
          </FeatureSwitch>

          <FeatureSwitch
            label="Participant Poll"
            caption={copy.poll}
            checked={fields.pollEnabled}
            onChange={fields.setPollEnabled}
          >
            {/* Shows when the poll is on */}
            {fields.pollEnabled && (
              <TextField
                fullWidth
                label={scope === 'net' ? 'Poll Question' : 'Default Poll Question'}
                value={fields.pollQuestion}
                onChange={(e) => fields.setPollQuestion(e.target.value)}
                margin={scope === 'net' ? 'normal' : 'none'}
                placeholder={scope === 'net'
                  ? 'e.g., What mode do you use most: SSB, FM, or Digital?'
                  : 'e.g., What band do you operate most?'}
                helperText={scope === 'net'
                  ? 'The poll question. NCS enters responses with autocomplete so answers stay consistent.'
                  : "Every new net starts with this question. Leave it blank to set each net's topic in Topics."}
                sx={{ ...(scope === 'schedule' ? { mt: 1 } : {}), ml: 4.5, width: 'calc(100% - 36px)' }}
              />
            )}
          </FeatureSwitch>
        </FoldingFormSection>

        {/* ========== ARES & EmComm Features (folds) ========== */}
        <FoldingFormSection
          id="ares-features"
          title="ARES & EmComm Features"
          caption="Features for emergency communications and formal net operations."
          optionCount={optionCounts.ares}
          chips={chips.ares}
          expanded={open.ares}
          onExpandedChange={setOpen('ares')}
        >
          <FeatureSwitch
            label="Enable ICS-309 Communications Log format"
            caption="When on, everyone who gets the closing log receives it as an ICS-309, the form used by ARES, RACES, and served agencies, unless you turn that off on the Reports tab. When off, they get the plain check-in log, except anyone who chose ICS-309 in their own profile, who still gets one."
            checked={fields.ics309Enabled}
            onChange={fields.setIcs309Enabled}
          />
          <FeatureSwitch
            label="Hide muted stations from ICS-309"
            caption="A station net control mutes for spam or disruption is left out of the ICS-309 log (CSV, PDF, and the closing email) — the copy that reaches a served agency. Their chat log and check-in stay on record either way."
            checked={fields.ics309HideMutedStations}
            onChange={fields.setIcs309HideMutedStations}
          />
          <FeatureSwitch
            label="Enable Station-to-Station Coverage Logging"
            caption="Adds a 'can hear' action to each check-in. Stations can record their own reception; NCS, Logger, and Relay can record on behalf of any station."
            checked={fields.propagationLoggingEnabled}
            onChange={fields.setPropagationLoggingEnabled}
          >
            {/* Shows when coverage logging is on */}
            {fields.propagationLoggingEnabled && (
              <Box sx={{ ml: 4.5 }}>
                <FeatureSwitch
                  label="Allow stations to self-report"
                  caption="When disabled, only Net Control, Logger, and Relay can record 'can hear' reports; regular stations won't see the action."
                  checked={fields.selfCanHearEnabled}
                  onChange={fields.setSelfCanHearEnabled}
                />
              </Box>
            )}
          </FeatureSwitch>

          {/* Net form only: shelters, aid stations, and (with coverage
              logging) repeaters/nodes and primary sites */}
          {sites && <Box sx={{ mt: 2 }}>{sites.editor}</Box>}

          <FeatureSwitch
            label="Authenticated Net"
            caption="Lets NCS or Logger verify a checked-in station's identity by comparing the code on their authenticator app to the one ECTLogger computes for their account. Stations without two-factor authentication set up show as unverified."
            checked={fields.authenticated}
            onChange={fields.setAuthenticated}
          />

          {/* Net form only, once the net exists: the Drill plan link */}
          {aresExtra}
        </FoldingFormSection>

        {/* ========== SKYWARN Features (folds) ========== */}
        <FoldingFormSection
          id="skywarn-features"
          title="SKYWARN Features"
          caption="For spotter nets that collect weather reports."
          optionCount={optionCounts.skywarn}
          chips={chips.skywarn}
          expanded={open.skywarn}
          onExpandedChange={setOpen('skywarn')}
        >
          <Box sx={{ mt: 2 }}>
            <StripSettings fields={fields} formDefinitions={formDefinitions} scope={scope} />
          </Box>
        </FoldingFormSection>
      </Box>
    </>
  );
};

export default NetFeaturesPanel;
