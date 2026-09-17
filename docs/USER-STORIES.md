
# Emergency Communications Team Deployment or Excercise
The Emergency Communications Team is activated. We send two operators to the Emergency Management Agency's radio room where one person runs the HF station for voice and digital (like JS8CALL), and another runs the VHF/UHF station where they can coordinate field operators on the VHF and UHF repeaters, as well as over DMR (VHF digital voice).

One operator, the primary coordinator, would start a multi-NCS net with the HF guy, and they could both take check-ins from field operators to get situational awareness reports, weather status, and requests for goods from a shelter.

FIeld operators would likely not all have Internet access, and would rely solely on HF, but some could load the web app on the phone. They'll check in from their location on each frequency and mode, and get recorded each time as a check-in or recheck by either of the NCS operators, and it would add the frequency, mode or channel to the field operator's available channels. 

Each net control or NCS would mark the frequencies that they're capable of in their own check-in on the list, and switch between frequencies with the frequency chips. I'd like each NCS in the check-in list that is actively operating the net to be highlighted a unique color, and the frequency chip that they're active on highlighted that color, for all users and guests to see.

When an NCS user clicks a frequency chip, it already highlights the check-ins that have checked in to each frequency. I'd like to allow them to control+click to filter for those stations, hiding anyone else on other frequencies, but still be able to recheck stations that have checked in on other frequencies. A tool-tip should pop up for the frequency chips so that people know what they do. Users should be able to click a frequency chip to indicate that they're actively listening on a given frequency, but it shouldn't make it harder for NCS to be able to view stations that checked in over the radio for a given frequency that do not have access to the Internet and the web application.

We also need to be able to track location changes of field operators, since the check-in log window only shows the most recent location. A couple of ideas, either or both work:
- Check out the old location and check in the new one as a recheck
- Add "from {location} in the chat log; e.g.: Dec 06 20:34:17 UTC *** KC1KTX has checked in from Bridgton ME ***

Lastly, for emcomm nets, in addition to the check-in log and chat log (which does log each individual action), I'd like to have a checkbox on the net scheduler and edit dialogs that would send the NCS stations and owner an ICS-309 Communications Log: https://archive.arrl-nfl.org/wp-content/uploads/2019/07/ICS-309-Fillable-Form.pdf, filling in the Message field with the contents of a Notes field.
# Statewide Drill, September 17 2026 — Two Sites, One County, Everything Handwritten Twice

The exercise ran statewide: all 13 counties, the Maine Emergency Management Agency, and a SimCell injecting the scenario. Our ARES team supported our own county only. Within that, our team was split between the EMA's old building, which has a well established radio station, and a new building with a barebones station. We served the EOC at the new location. The scenario ran as an incident with infrequent comms, as needed: coordinators fed us sitreps and we had to roll with whatever they gave us.

At one point we were told the Internet, phones, and cellular were all down at the EOC, and that a shelter was reaching capacity and needed supplies. Our EOC asked us hams to get a request for the specific supplies to MEMA. We radioed the list to the team members at the old office, and they relayed the request over HF. It could have been an ICS-213, but it went as a verbalized list.

We also reported every sitrep and communication we heard from other counties and from MEMA, for our own county's situational awareness. Each one was handwritten as we heard it. Someone then typed each one into a spreadsheet and into Slack. We then typed each one again into an ICS-214. The other team kept ICS-309 logs.

What this drill actually demonstrated:

- **One thing heard, four places written.** Handwritten note, spreadsheet, Slack, ICS-214. Same information, four transcriptions, four chances to differ. This is the same disease as the EMA attendance sheet being retyped into a master spreadsheet.
- **A resource request went out as an unstructured verbal list.** The app already files ICS-213s with a full chain of custody and would have recorded both hops of that relay, new office to old office to MEMA. Nothing needed building; the form was already there and we did not reach for it.
- **Most of what we logged was not our traffic.** We were not in the chain of custody for another county's sitrep. We overheard it and wrote it down because our county needed to know. That category of record has no home in the app at all, and it was the bulk of the work.
- **Two sites, one team, relaying between them.** The new building could not reach MEMA directly. Everything outbound went by VHF to the old office and out over HF from there.
