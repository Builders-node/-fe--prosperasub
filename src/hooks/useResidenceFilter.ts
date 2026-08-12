import { useCallback } from "react";
import { useSelectedResidence } from "@/contexts/LocationContext";
import { useResidences } from "@/hooks/useResidences";

/**
 * The residence filter, in one place.
 *
 * Cleaning, food and cars each had the same three lines — look the selected
 * name up in the residences list to get an id, then keep a row when it has no
 * residence links at all or lists this one. The "no links means everywhere"
 * rule is the important half: a provider that never filled in service areas
 * must not vanish the moment a customer picks a neighbourhood.
 *
 * Reading this hook also tells the header that the residence selector does
 * something on this page — see LocationContext.
 */
export function useResidenceFilter() {
  const { residence } = useSelectedResidence();
  const { data: residences = [] } = useResidences();

  const residenceId = residence
    ? (residences.find((r) => r.name === residence)?.id ?? null)
    : null;

  const servesHere = useCallback(
    (residenceIds: string[] | null | undefined) =>
      !residenceId || !residenceIds?.length || residenceIds.includes(residenceId),
    [residenceId],
  );

  return {
    /** The chosen residence's display name, "" when none. */
    residence,
    /** Its id, or null when nothing is chosen or the name no longer exists. */
    residenceId,
    /** True when this row's service areas include the choice (or it has none). */
    servesHere,
    /** True when a choice is in effect — i.e. the list below is a filtered one. */
    isFiltering: residenceId !== null,
  };
}
