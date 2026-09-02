export type MoveItemFailureCode =
  | "not_found"
  | "duplicate"
  | "insertion_choice_required"
  | "no_parent_group"
  | "not_custom_mode"
  | "invalid_reference";

export class MoveItemError {
  constructor(
    public message: string,
    public code: MoveItemFailureCode,
  ) {}
}
