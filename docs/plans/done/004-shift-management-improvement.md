# Shift management app 

## Feature request 1 : export to pdf 

The shift management app allows users to sign up to at least one shift of a particular event. 

An event has different slots with a description of the job expected, a date, begin time, end time.

The idea is to provide a PDF grid with the visual of the event as a timetable. 

here is an example : 

================================================================
                             EVENT name
================================================================
          day 1        | day 2    | ....          | day n
================================================================
timeslot1 |timeslot2   |timeslot1 |timeslot 2 | ...| timeslot1 etc.
================================================================
 person 1 |  [color the corresponding slots]
 person 2 | color the corresponding slots]
================================================================
footer : [color1] : shift type1 | [color2] : shift type 2  | ...| page a/n
================================================================


The pdf grid should be exportable by anyone.

## Feature request 2 : bound begin and end dates to the edition duration datesaa

Pretty-much self explanatory : each edition has a begin and an end date. shift management should ensure that an event creation can´t be done out of those bounds. raise a client side validation error **during input** to ensure that an out of bounds date can´t be entered as a begin or end date for an event. also add server side validation to avoid date injection. 

There are two mechanisms for client validation : 
- field is misentered : works when clicking on "new event" and has a tooltip 
- advanced validation (Data is correct but ex. end date < begin date) 

in this case the second validation mechanism should be used

