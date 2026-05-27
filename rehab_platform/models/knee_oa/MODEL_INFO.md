# Knee KL Grade Model

Main model file:

kl_grade_model.pt

This model is for graded knee osteoarthritis / Kellgren-Lawrence prediction.

Expected classes:
0 = Normal
1 = Doubtful
2 = Mild
3 = Moderate
4 = Severe

If the UI needs 1-5 display:
display_grade = kl_grade + 1

Do not commit model weight files to GitHub.
