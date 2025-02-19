const express = require('express');
const mssql = require('mssql');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = 5000;


app.use(bodyParser.json());
app.use(cors());




const dbConfig = {
  user: 'sa',
  password: '12345',
  server: 'DESKTOP-54ML9PE',
  database: 'AMS',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },

};


mssql.connect(dbConfig).then(pool => {
  if (pool.connected) {
    console.log('Connected to MSSQL');

    app.get('/api/employees', async (req, res) => {
      try {
        const result = await pool.request().query('SELECT * FROM Employees');
        res.status(200).json(result.recordset);
      } catch (err) {
        console.error('Error executing query:', err.message);
        res.status(500).send('Internal Server Error');
      }
    });
    app.get('/api/items', async (req, res) => {
      try {
        const result = await pool.request().query('SELECT * FROM Items');
        res.status(200).json(result.recordset);
      } catch (err) {
        console.error('Error executing query:', err.message);
        res.status(500).send('Internal Server Error');
      }
    });
    // app.get('/api/products', async (req, res) => {
    //   try {
    //     const result = await pool.request().query('SELECT * FROM Products');
    //     res.status(200).json(result.recordset);
    //   } catch (err) {
    //     console.error('Error executing query:', err.message);
    //     res.status(500).send('Internal Server Error');
    //   }
    // });
    // app.get('/api/medicines', async (req, res) => {
    //   try {
    //     const result = await pool.request().query('SELECT * FROM Medicines');
    //     res.status(200).json(result.recordset);
    //   } catch (err) {
    //     console.error('Error executing query:', err.message);
    //     res.status(500).send('Internal Server Error');
    //   }
    // });
    app.get('/api/attendance', async (req, res) => {
        try {
          const { date, EmployeeId } = req.query;
      
          let query = `
            SELECT Attendance.*, Employees.name 
            FROM Attendance
            JOIN Employees ON Attendance.EmployeeId = Employees.EmployeeId
          `;
      
          const conditions = [];
          if (date) {
            conditions.push(`attendance_date = '${date}'`);
          }
          if (EmployeeId) {
            conditions.push(`Attendance.EmployeeId = '${EmployeeId}'`);
          }
      
          if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
          }
      
          const result = await pool.request().query(query);
      
          res.status(200).json(result.recordset);
        } catch (err) {
          console.error('Error executing query:', err.message);
          res.status(500).send('Internal Server Error');
        }
      });
      

    app.post('/api/addattendance', async (req, res) => {
        try {
          const {
            attendance_date,
            present,
            EmployeeID,
            in_time,
            out_time,
            Latitude,
            Longitude,
            
          } = req.body;
      
          const request = pool.request();
      
          request.input('attendance_date', attendance_date);
          request.input('present', present);
          request.input('EmployeeID', EmployeeID);
          request.input('in_time', in_time);
          request.input('out_time', out_time);
          request.input('Latitude', Latitude);
          request.input('Longitude', Longitude);
      
          const queryText = `
            INSERT INTO Attendance 
            (attendance_date, present, EmployeeID, in_time, out_time, Latitude, Longitude)
            VALUES (@attendance_date, @present, @EmployeeID, @in_time, @out_time, @Latitude, @Longitude)
          `;
      
          await request.query(queryText);
      
          res.status(201).json({ message: 'Attendance inserted successfully' });
        } catch (err) {
          console.error('Error inserting attendance:', err.message);
          res.status(500).send('Internal Server Error');
        }
      });

      app.put('/api/attendance/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const { out_time, Out_Latitude, Out_Longitude } = req.body;
    
            let pool = await mssql.connect(dbConfig);
    
            await pool.request()
                .input('AttendanceId', mssql.Int, id)
                .input('out_time', mssql.NVarChar, out_time)
                .input('Out_Latitude', mssql.NVarChar, Out_Latitude)
                .input('Out_Longitude', mssql.NVarChar, Out_Longitude)
                .query(`
                    UPDATE Attendance
                    SET out_time = @out_time,
                        Out_Latitude = @Out_Latitude,
                        Out_Longitude = @Out_Longitude
                    WHERE AttendanceId = @AttendanceId
                `);
    
            res.status(200).json({ message: 'Attendance updated successfully' });
        } catch (err) {
            console.error('Error updating attendance:', err);
            res.status(500).send('Internal Server Error');
        }
    });
    
      
    
  }
}).catch(err => {
  console.error('Database connection failed:', err.message);
});


app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
