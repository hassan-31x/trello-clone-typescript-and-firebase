import { useState, useEffect, useContext } from "react";
import { DragDropContext, DropResult } from "react-beautiful-dnd";
import toast from "react-hot-toast";

import "../App.css";

import { INote, INotesList } from "../interfaces/NotesInterface";
import { ItemType } from "../types/NoteType";
import Gradient from "./Gradient";
import { AuthContext } from "../context/authContext.tsx";

import { db } from "../config/firebaseConfig.ts";
import {
  collection,
  doc,
  updateDoc,
  deleteDoc,
  addDoc,
  onSnapshot,
} from "firebase/firestore";

import Loader from "./Loader.tsx";
import NoteCard from "./NoteCards.tsx";

function NotesDisplay() {
  const [fetching, setFetching] = useState(false);
  const [state, setState] = useState<INotesList[]>([]);

  const { user } = useContext(AuthContext);

  const getUserNoteContainers = (userId: string) => {
    // setFetching(true);
    const unsub = onSnapshot(collection(doc(db, "users", userId), "noteContainer"), (noteContainerQuerySnapshot) => {
      try {
        const noteContainers: INotesList[] = [];

        noteContainerQuerySnapshot.docs.map((noteContainerDoc) => {
          let firstTime = true
          const noteContainerData = noteContainerDoc.data();
          console.log('fething container')
          const noteContainer: INotesList = {
            id: noteContainerDoc.id.toString(),
            name: noteContainerData.name,
            notes: [],
            isEditable: noteContainerData.isEditable,
            index: noteContainerData.index,
          };

          try {
            const unsub2 = onSnapshot(collection(noteContainerDoc.ref, "notes"), (notesQuerySnapshot) => {
              console.log(noteContainer)
              noteContainer.notes = [];
              notesQuerySnapshot.docs.map((noteDoc) => {
                const noteData = noteDoc.data();
                console.log(noteData)
                console.log('fetching note', state)
                const note: INote = {
                  id: noteDoc.id,
                  content: noteData.content,
                  isEditable: noteData.isEditable,
                  index: noteData.index,
                };
                noteContainer.notes.push(note);
              });
              if (state.length) {
                let tempState = [...state]
                tempState[tempState.findIndex(obj => obj.id === noteContainer.id)] = noteContainer;
                setState(tempState)
              }
            });
          }  catch (err) {console.log(err);}
          noteContainers.push(noteContainer);
        });

        noteContainers.sort((a, b) => a.index - b.index);

        noteContainers.forEach((container) => {
          container.notes.sort((a, b) => a.index - b.index);
        });

        setTimeout(() => {
          // setFetching(false);
          setTimeout(() => {
            setState(noteContainers);
          }, 200);
        }, 1000);
        console.log(noteContainers);
        console.log(state)
      } catch (err) {
        console.log(err);
      }
    });
  };

  useEffect(() => {

    let unsubscribe
    console.log(user)
    if (user) {
      // console.log('user') 
      // getUserNoteContainers(`${user.uid}`)
      unsubscribe = getUserNoteContainers(`${user.uid}`);
      } else {
        console.log('no user')
    }

    // return () => {
    //   unsubscribe()
    // }

  }, [user]);
  

  const updateIds = async (
    containerIndex: number,
    id: string,
    index: number
  ) => {
    if (user) {
      const noteRef = doc(
        db,
        "users",
        user.uid,
        "noteContainer",
        state[containerIndex].id,
        "notes",
        id
      );

      const newContent = {
        index,
      };
      await updateDoc(noteRef, newContent);
    }
  };

  const reorder = (
    list: ItemType,
    startIndex: number,
    endIndex: number,
    containerIndex: number
  ) => {
    if (startIndex > endIndex) {
      //if reordering upwards
      if (endIndex === 0) {
        //if placed on top of container
        list[startIndex].index = list[endIndex].index - 1;
      } else {
        list[startIndex].index =
          (list[endIndex].index + list[endIndex - 1].index) / 2;
      }
    } else {
      if (endIndex === list.length - 1) {
        //if placed on bottom of container
        list[startIndex].index = list[endIndex].index + 1;
      } else {
        list[startIndex].index =
          (list[endIndex].index + list[endIndex + 1].index) / 2;
      }
    }

    updateIds(containerIndex, list[startIndex].id, list[startIndex].index);

    console.log(list, startIndex, endIndex);
    const result = Array.from(list);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
    return result;
  };

  const updateDrag = async (
    source: { index: number; droppableId: string },
    destination: { index: number; droppableId: string },
    removed: INote
  ) => {
    let newNoteIndex: number;
    if (user) {
      try {
        // toast.promise
        toast.loading("Moving...", { duration: 2000 });
        const { content, isEditable } = removed;
        const userDocRef = doc(db, "users", user?.uid);
        const noteContainerRef: any = doc(
          userDocRef,
          "noteContainer",
          state[parseInt(destination.droppableId)].id
        );

        console.log(source, destination);
        if (!state[destination.droppableId * 1].notes.length) newNoteIndex = 0;
        else {
          if (destination.index === 0) {
            //if placed on top of another container
            newNoteIndex =
              state[destination.droppableId * 1].notes[0].index - 1;
          } else if (
            destination.index ===
            state[destination.droppableId * 1].notes[
              state[destination.droppableId * 1].notes.length - 1
            ].index +
              1
          ) {
            newNoteIndex =
              state[destination.droppableId * 1].notes[
                state[destination.droppableId * 1].notes.length - 1
              ].index + 1;
          } else {
            newNoteIndex =
              (state[destination.droppableId * 1].notes[destination.index]
                .index +
                state[destination.droppableId * 1].notes[destination.index - 1]
                  .index) /
              2;
          }
        }

        console.log(newNoteIndex);

        const newNoteRef = await addDoc(collection(noteContainerRef, "notes"), {
          content,
          isEditable,
          index: newNoteIndex,
        });

        const anotherNoteContainerRef: any = doc(
          userDocRef,
          "noteContainer",
          state[parseInt(source.droppableId)].id
        );
        const noteRef = doc(
          collection(anotherNoteContainerRef, "notes"),
          state[parseInt(source.droppableId)].notes[source.index].id
        );

        await deleteDoc(noteRef);

        toast.success("Note moved successfully");
        return [newNoteRef.id, newNoteIndex];
      } catch (error) {
        console.log("Error deleting note:", error);
      }
    }
  };

  const move = (
    source: ItemType,
    destination: ItemType,
    droppableSource: { droppableId: string; index: number },
    droppableDestination: { droppableId: string; index: number }
  ) => {
    const sourceClone = Array.from(source);
    const destClone = destination.length ? Array.from(destination) : [];
    const [removed] = sourceClone.splice(droppableSource.index, 1);

    destClone.splice(droppableDestination.index, 0, removed);

    const result: { [key: string]: ItemType } = {};
    result[droppableSource.droppableId] = sourceClone;
    result[droppableDestination.droppableId] = destClone;

    return { result, removed };
  };

  const onDragEnd = async (result: DropResult) => {
    const { source, destination } = result;
    console.log(source, destination);

    // Dropped outside the list
    if (!destination) {
      return;
    }

    const sInd = +source.droppableId;
    const dInd = +destination.droppableId;

    if (sInd === dInd) {
      const items = reorder(
        state[sInd].notes,
        source.index,
        destination.index,
        source.droppableId
      );
      let newObject = state[sInd];
      newObject.notes = items;
      const tempState = [...state];
      tempState.splice(sInd, 1, newObject);
      setState(tempState);
    } else {
      try {
        const { result, removed } = move(
          state[sInd].notes,
          state[dInd].notes,
          source,
          destination
        );
        console.log(source, destination, removed);
        const [id, index] = await updateDrag(source, destination, removed);
        // const id = res.id
        // const index = res.index
        console.log(id, index);

        const tempState: any = [...state];
        tempState[sInd].notes = result[sInd];
        tempState[dInd].notes = result[dInd];

        const updatedNotes = tempState[dInd].notes.map((note: INote) => {
          if (note.id === removed.id) {
            return {
              ...note,
              id,
              index,
            };
          }
          return note;
        });

        tempState[dInd].notes = updatedNotes;

        setState(tempState);
      } catch (error) {
        console.error("Error moving note:", error);
      }
    }
  };

  const addNoteContainer = async () => {
    let noteContainerRef;
    if (user) {
      const noteContainerData = {
        name: `Untitled ${state.length + 1}`,
        isEditable: false,
        index: state.length ? state[state.length - 1].index + 1 : 0,
      };
      const userDocRef = doc(db, "users", user?.uid);
      noteContainerRef = await addDoc(
        collection(userDocRef, "noteContainer"),
        noteContainerData
      );
    }

    // setState([
    //   ...state,
    //   {
    //     id: noteContainerRef ? noteContainerRef.id : "",
    //     name: `Untitled ${state.length + 1}`,
    //     notes: [],
    //     isEditable: false,
    //     index: state.length ? state[state.length - 1].index + 1 : 0,
    //   },
    // ]);
    toast.success("Note list created");
  };

  return (
    <div className="w-full grow bg bg-no-repeat bg-cover bg-blue-700">
      <Gradient />
      {fetching ? <Loader /> : (
        <div className="flex flex-wrap gap-5 max-w-7xl mx-auto mt-10 px-2 md:px-10 items-start">

          <DragDropContext onDragEnd={onDragEnd}>
            {state.map((el, ind) => (
              <NoteCard state={state} seState={setState} container={el} index={ind} userId={user?.uid || ''} key={ind} />
            ))}
          </DragDropContext>

          <button className="p-2 w-60 px-3 py-3 min-w-[250px] rounded-2xl duration-200 delay-75 bg-[#F1F2F4] hover:bg-gray-300 h-16 ease-out opacity-40" type="button"
            onClick={() => {!user && setState([...state, { id: Date.now().toString(), name: `Untitled ${state.length + 1}`, notes: [], isEditable: false, index: state.length}]);
            user && addNoteContainer()}}>
            <span className="opacity-100 text-black font-regular">+ Add new list</span>
          </button>

        </div>
      )}
    </div>
  );
}

export default NotesDisplay;