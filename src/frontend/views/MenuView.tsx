import { useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Segmented } from "@termix-ssh/plugin-sdk/ui";
import type { RouterInfo } from "../api";
import type { ViewSpec } from "../menus/types";
import { FormView } from "./FormView";
import { TableView } from "./TableView";

export interface MenuViewProps {
  hostId: number;
  info: RouterInfo | null;
  menus: string[];
  isVisible: boolean;
}

/** Draws a menu's view: a list, a form, tabs of those, or a panel of its own. */
export function MenuView({
  view,
  ...props
}: MenuViewProps & { view: ViewSpec }) {
  if (view.kind === "table") {
    return (
      <TableView
        hostId={props.hostId}
        spec={view}
        isVisible={props.isVisible}
      />
    );
  }
  if (view.kind === "form") {
    return (
      <FormView hostId={props.hostId} spec={view} isVisible={props.isVisible} />
    );
  }
  if (view.kind === "custom") {
    const Component = view.component;
    return <Component {...props} />;
  }
  return <TabsView view={view} {...props} />;
}

function TabsView({
  view,
  ...props
}: MenuViewProps & { view: Extract<ViewSpec, { kind: "tabs" }> }) {
  const { t } = useTranslation();
  const tabs = view.tabs.filter(
    (tab) =>
      !tab.requires || tab.requires({ info: props.info, menus: props.menus }),
  );
  const [active, setActive] = useState(tabs[0]?.id);
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];
  if (!current) return null;
  return (
    <div className="flex min-h-0 flex-col gap-3">
      {tabs.length > 1 && (
        <Segmented
          className="max-w-full overflow-x-auto [&>*]:shrink-0 [&>*]:whitespace-nowrap"
          value={current.id}
          onChange={(v) => setActive(v)}
          options={tabs.map((tab) => ({
            value: tab.id,
            label: t(tab.labelKey),
          }))}
        />
      )}
      <MenuView key={current.id} view={current.view} {...props} />
    </div>
  );
}
