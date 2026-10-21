import React from 'react';

// ========== EXERCISE MARKING ==========
// Printed at the top and bottom of a drill form. ARES exercise plans require
// every formal message to say it is an exercise at its beginning and end, so a
// printed drill message found later can't be mistaken for real traffic.
// Shared by every form-accurate print view, and by the blank ICS-213 pad.

export const EXERCISE_MARKING_TEXT = 'THIS IS AN EXERCISE';

export const isExerciseForm = (form: { test_category?: string | null }) => form.test_category === 'drill';

const ExerciseMarking: React.FC<{ position: 'top' | 'bottom' }> = ({ position }) => (
  <div
    style={{
      textAlign: 'center',
      fontSize: 14,
      fontWeight: 700,
      letterSpacing: 2,
      color: '#000000',
      border: '2px solid #000000',
      padding: '3px 0',
      ...(position === 'top' ? { marginBottom: 8 } : { marginTop: 8 }),
    }}
  >
    {EXERCISE_MARKING_TEXT}
  </div>
);

export default ExerciseMarking;
