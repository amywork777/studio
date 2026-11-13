import type { EnvironmentId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";

import { usePrimaryEnvironmentId } from "~/state/environments";
import { InlineButton } from "../../ui/button";
import type { LibrarySkill } from "./libraryCatalog";
import { libraryHref } from "./librarySearch";

/**
 * The library reads the primary environment's plugins, so a skill listed for another environment
 * has no Toolbox link.
 */
export function PluginSkills(props: {
  /** This plugin's skills (`librarySkills`). */
  readonly skills: ReadonlyArray<LibrarySkill>;
  readonly skillLabel: (name: string) => string;
  /** The environment whose plugin these skills belong to. */
  readonly environmentId: EnvironmentId;
}) {
  const inLibrary = usePrimaryEnvironmentId() === props.environmentId;
  return (
    <ul role="list" className="pt-3 pb-2 text-xs">
      {props.skills.map((skill) => {
        const name = props.skillLabel(skill.name);
        return (
          <li key={skill.id} className="min-w-0 border-t border-border/50 py-2">
            {inLibrary ? (
              <InlineButton
                aria-label={`${name} in the Toolbox`}
                render={<Link {...libraryHref({ entry: skill.id })} />}
              >
                {name}
              </InlineButton>
            ) : (
              <p className="font-medium text-foreground">{name}</p>
            )}
            {skill.description === "" ? null : (
              <p className="max-w-xl leading-normal text-muted-foreground">{skill.description}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
