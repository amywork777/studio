import type { EnvironmentId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { usePrimaryEnvironmentId } from "~/state/environments";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { ChatPage } from "../ChatPages";
import { useExample, useExamples } from "../library/useSampleProject";
import { readmeInline, readmeSections } from "../projectReadme";
import { MODULE_HEADING, SECTION_STACK } from "../studioLayout";
import { ExamplePicture } from "./ExampleCard";
import { NEEDS_DESKTOP_APP } from "./examples";

/**
 * An example's page (`/library/examples/$id`), view only: its picture, What it is (its README's, read from
 * the server), what it shows, and one button, Make a copy to edit, which makes a project of your
 * own from it and opens it (`useExample`), on `file` where a link named one (the Library's See the
 * example). The example itself never changes. Where nothing can be copied, the button says why.
 */
export function ExampleDetail(props: {
  readonly sampleId: string;
  readonly file: string | undefined;
}) {
  const environmentId = usePrimaryEnvironmentId();
  return environmentId === null ? null : (
    <ExampleContent environmentId={environmentId} sampleId={props.sampleId} file={props.file} />
  );
}

function ExampleContent(props: {
  readonly environmentId: EnvironmentId;
  readonly sampleId: string;
  readonly file: string | undefined;
}) {
  const { environmentId } = props;
  const { loaded } = useExamples(environmentId);
  const example = useExample(environmentId, props.sampleId);
  const readme = useEnvironmentQuery(
    example === null
      ? null
      : projectEnvironment.readFile({
          environmentId,
          input: { cwd: example.sample.path, relativePath: "README.md" },
        }),
  );
  // Under way: copying the example, then building the part it opens on.
  const [copying, setCopying] = useState<"copying" | "building" | null>(null);

  if (!loaded) return null;
  if (example === null) {
    return (
      <ChatPage title="Toolbox">
        <p className="text-sm text-muted-foreground">
          Studio has no example by that name.{" "}
          <Link
            to="/library"
            className="text-foreground underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-foreground"
          >
            See the library
          </Link>
        </p>
      </ChatPage>
    );
  }

  const { sample } = example;
  const fromReadme = readmeSections(readme.data?.contents ?? null).whatItIs;
  // Its README's words once read, as plain text; the example's own line where it has none.
  const settled = readme.isSuccess || readme.error !== null;
  const whatItIs =
    fromReadme === null
      ? settled
        ? sample.purpose
        : null
      : readmeInline(fromReadme)
          .map((piece) => piece.text)
          .join("");
  const copy = () => {
    setCopying("copying");
    void example.copy(props.file, () => setCopying("building")).finally(() => setCopying(null));
  };

  return (
    <ChatPage
      title={sample.name}
      lede="An example, view only. A copy goes to your projects, and the example never changes."
      action={
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <Button size="sm" disabled={!example.canCopy || copying !== null} onClick={copy}>
            {copying === "copying"
              ? "Copying…"
              : copying === "building"
                ? "Building the part…"
                : "Make a copy to edit"}
          </Button>
          <span className="text-xs text-muted-foreground">
            {example.canCopy ? `Makes ${example.copyName}` : NEEDS_DESKTOP_APP}
          </span>
        </div>
      }
    >
      <ExamplePicture
        sampleId={sample.id}
        className="w-full max-w-2xl rounded-lg border border-border"
      />
      <section className={SECTION_STACK}>
        <h2 className={MODULE_HEADING}>What it is</h2>
        {whatItIs === null ? null : <p className="max-w-2xl text-sm text-foreground">{whatItIs}</p>}
      </section>
      {sample.shows.length === 0 ? null : (
        <section className={SECTION_STACK}>
          <h2 className={MODULE_HEADING}>What it shows</h2>
          <ul className="flex flex-wrap gap-2">
            {sample.shows.map((tag) => (
              <li key={tag}>
                <Badge variant="outline">{tag}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </ChatPage>
  );
}
