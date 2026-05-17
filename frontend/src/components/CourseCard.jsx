import { Link } from 'react-router-dom';
import { FiClock, FiBookOpen } from 'react-icons/fi';

export default function CourseCard({ course }) {
  return (
    <Link to={`/courses/${course._id}`} className="card hover:shadow-md transition-shadow group overflow-hidden block">
      <div className="relative overflow-hidden">
        <img
          src={course.thumbnail || 'https://via.placeholder.com/400x220?text=Khóa+học'}
          alt={course.title}
          className="w-full h-44 object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {course.level && (
          <span className={`absolute top-2 left-2 text-xs px-2 py-1 rounded-full font-medium ${course.level.bgColor} ${course.level.textColor}`}>
            {course.level.name}
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 line-clamp-2 mb-2 group-hover:text-blue-600 transition-colors">
          {course.title}
        </h3>
        <p className="text-gray-500 text-sm line-clamp-2 mb-3">{course.description}</p>
        <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
          <span className="flex items-center gap-1"><FiBookOpen /> {course.totalLessons} bài học</span>
          <span className="flex items-center gap-1"><FiClock /> {course.duration || 'Linh hoạt'}</span>
        </div>
        <div className="flex items-center gap-2">
          {course.instructor?.avatar ? (
            <img src={course.instructor.avatar} alt={course.instructor.name} className="w-6 h-6 rounded-full" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-medium">
              {course.instructor?.name?.charAt(0)}
            </div>
          )}
          <span className="text-xs text-gray-600">{course.instructor?.name}</span>
        </div>
      </div>
    </Link>
  );
}
