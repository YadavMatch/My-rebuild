/**
 * Age from a date of birth.
 *
 * Shared because two screens need the same answer: the age gate, which
 * decides whether someone may use the app at all, and profile setup, which
 * fills in the age shown on the card. Asking twice would invite two answers.
 */

/** Whole years completed, counting the month and day, not just the year. */
export function ageOn(birth: Date, on: Date): number {
  let age = on.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    on.getMonth() < birth.getMonth() ||
    (on.getMonth() === birth.getMonth() && on.getDate() < birth.getDate());
  if (beforeBirthday) {
    age -= 1;
  }
  return age;
}

/** Age from the `YYYY-MM-DD` the age gate stores, or null if it cannot be read. */
export function ageFromStoredDate(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) {
    return null;
  }
  const parsed = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return ageOn(parsed, new Date());
}
