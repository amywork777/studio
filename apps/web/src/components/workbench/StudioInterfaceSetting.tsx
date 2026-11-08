import { SettingsPageContainer, SettingsRow, SettingsSection } from "../settings/settingsLayout";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import {
  STUDIO_INTERFACE_AVAILABLE,
  interfaceSwitchPlacement,
  type StudioInterface,
  setStudioInterface,
  useEngineeringInterface,
  useStudioInterface,
} from "./studioInterface";

const LABELS: Record<StudioInterface, string> = {
  engineering: "Engineering",
  both: "Engineering with code",
  code: "Code",
};

const DESCRIPTIONS: Record<StudioInterface, string> = {
  engineering:
    "Parts, checks and outputs first: the project's Overview, and Analysis, Manufacturing and Documents. The code tools and the terminal stay out of the way.",
  both: "The engineering surfaces with every coding tool kept in view: the project's Overview, plus branches, diffs, the terminal, source files and the agent's commands.",
  code: "Every coding tool in view: branches, diffs, the terminal and the agent's commands, for working on the code behind a model.",
};

const ORDER: ReadonlyArray<StudioInterface> = ["engineering", "both", "code"];

/**
 * Settings, Appearance, Interface: Studio as an engineering app, a code editor, or engineering with
 * the code tools. The engineering interface keeps this switch under Advanced instead
 * (`StudioInterfaceSettingsPanel`), so it is not a row of Appearance there.
 */
export function StudioInterfaceSetting() {
  const engineering = useEngineeringInterface();
  if (interfaceSwitchPlacement(engineering, STUDIO_INTERFACE_AVAILABLE) !== "appearance") {
    return null;
  }
  return <StudioInterfaceRow />;
}

/**
 * Settings, Advanced, Interface: the same switch on a page of its own, which the engineering
 * interface's Advanced group lists. It is the way back to the code interfaces and their settings,
 * so it opens in every interface.
 */
export function StudioInterfaceSettingsPanel() {
  return (
    <SettingsPageContainer>
      <SettingsSection id="studio-interface-section" title="Interface">
        {STUDIO_INTERFACE_AVAILABLE ? <StudioInterfaceRow /> : null}
      </SettingsSection>
    </SettingsPageContainer>
  );
}

function StudioInterfaceRow() {
  const current = useStudioInterface();
  return (
    <SettingsRow
      id="studio-interface"
      title="Studio interface"
      description={DESCRIPTIONS[current]}
      control={
        <Select
          value={current}
          onValueChange={(value) => {
            const next = ORDER.find((entry) => entry === value);
            if (next !== undefined) setStudioInterface(next);
          }}
        >
          <SelectTrigger size="sm" className="w-full sm:w-56" aria-label="Studio interface">
            <SelectValue>{LABELS[current]}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {ORDER.map((value) => (
              <SelectItem key={value} hideIndicator value={value}>
                {LABELS[value]}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      }
    />
  );
}
