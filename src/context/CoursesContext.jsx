import { createContext, useContext, useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { auth, db } from "../utils/firebase";
import PropTypes from "prop-types";

const CoursesContext = createContext({ courses: {}, isLoadingCourses: true });

export const CoursesProvider = ({ children }) => {
  const [courses, setCourses] = useState({});
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setIsLoadingCourses(false);
      return;
    }

    const unsub = onSnapshot(
      collection(db, `users/${user.uid}/courses`),
      (snapshot) => {
        const coursesData = {};
        snapshot.forEach((doc) => {
          coursesData[doc.id] = doc.data();
        });
        setCourses(coursesData);
        setIsLoadingCourses(false);
      },
      (err) => {
        console.error("CoursesProvider: snapshot error", err);
        setIsLoadingCourses(false);
      }
    );

    return () => unsub();
  }, []);

  return (
    <CoursesContext.Provider value={{ courses, isLoadingCourses }}>
      {children}
    </CoursesContext.Provider>
  );
};

CoursesProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const useCourses = () => useContext(CoursesContext);
